import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, sendSuccess } from "../lib/http.js";
import {
  bulkSchema, listQuerySchema, productSchema, productStatusSchema,
} from "../validators/products.js";

const productInclude = {
  variants: { orderBy: { attribute: "asc" } },
  plans: { orderBy: { name: "asc" } },
  tax: true,
  createdBy: { select: { id: true, name: true, email: true } },
  _count: {
    select: {
      subscriptions: { where: { status: "ACTIVE" } },
      templateLines: true,
    },
  },
};

function productWarnings(product) {
  return Number(product.salesPrice) < Number(product.costPrice)
    ? ["Sales price is below cost price."]
    : [];
}

export const listProducts = asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  const where = {
    ...(query.search ? { name: { contains: query.search, mode: "insensitive" } } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const today = new Date();
  const weekStart = new Date(Date.UTC(
    today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 6,
  ));
  const productQuery = query.sortBy === "margin" || query.sortBy === "variantCount"
    ? (async () => {
      const filters = [
        query.search
          ? Prisma.sql`"name" ILIKE ${`%${query.search}%`}`
          : Prisma.sql`TRUE`,
        query.type
          ? Prisma.sql`"type" = ${query.type}::"ProductType"`
          : Prisma.sql`TRUE`,
        query.status
          ? Prisma.sql`"status" = ${query.status}::"ProductStatus"`
          : Prisma.sql`TRUE`,
      ];
      const sortExpression = query.sortBy === "margin"
        ? `"salesPrice" - "costPrice"`
        : `(SELECT COUNT(*) FROM "Variant" WHERE "Variant"."productId" = "Product"."id")`;
      const ids = await prisma.$queryRaw(Prisma.sql`
        SELECT "id" FROM "Product"
        WHERE ${Prisma.join(filters, " AND ")}
        ORDER BY ${Prisma.raw(sortExpression)} ${Prisma.raw(query.order.toUpperCase())}, "id" ASC
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}
      `);
      const rows = await prisma.product.findMany({
        where: { id: { in: ids.map(({ id }) => id) } },
        include: {
          _count: {
            select: {
              variants: true,
              subscriptions: { where: { status: "ACTIVE" } },
            },
          },
        },
      });
      const byId = new Map(rows.map((product) => [product.id, product]));
      return ids.map(({ id }) => byId.get(id)).filter(Boolean);
    })()
    : prisma.product.findMany({
      where,
      orderBy: [{ [query.sortBy]: query.order }, { id: "asc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        _count: {
          select: {
            variants: true,
            subscriptions: { where: { status: "ACTIVE" } },
          },
        },
      },
    });
  const [products, total, statusCounts, avgMargin, weeklyCounts] = await Promise.all([
    productQuery,
    prisma.product.count({ where }),
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRaw`SELECT COALESCE(AVG("salesPrice" - "costPrice"), 0)::numeric(10,2) AS "averageMargin" FROM "Product"`,
    prisma.$queryRaw`SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS count FROM "Product" WHERE "createdAt" >= ${weekStart} GROUP BY 1`,
  ]);
  const counts = Object.fromEntries(statusCounts.map(({ status, _count }) => [status, _count._all]));
  const dailyCounts = new Map(weeklyCounts.map(({ day, count }) => [day, count]));
  const stats = {
    total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    active: counts.ACTIVE || 0,
    inactiveArchived: (counts.INACTIVE || 0) + (counts.ARCHIVED || 0),
    averageMargin: String(avgMargin[0]?.averageMargin ?? "0.00"),
    weeklyAdds: Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setUTCDate(date.getUTCDate() + index);
      const day = date.toISOString().slice(0, 10);
      return {
        day: date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        count: dailyCounts.get(day) || 0,
      };
    }),
  };

  return sendSuccess(res, { products: products.map(({ _count, ...product }) => ({
    ...product,
    variantCount: _count.variants,
    activeSubscriptionCount: _count.subscriptions,
  })), stats }, {
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
    },
  });
});

export const getProduct = asyncHandler(async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: productInclude,
  });
  if (!product) throw new HttpError(404, "Product not found.");
  return sendSuccess(res, product);
});

function nestedData(input) {
  return {
    ...input,
    salesPrice: input.salesPrice.toFixed(2),
    costPrice: input.costPrice.toFixed(2),
    notes: input.notes || null,
    taxId: input.taxId || null,
    variants: {
      create: input.variants.map(({ id: _id, ...variant }) => ({
        ...variant,
        extraPrice: variant.extraPrice.toFixed(2),
      })),
    },
    plans: {
      create: input.plans.map(({ id: _id, ...plan }) => ({
        ...plan,
        price: plan.price.toFixed(2),
        availableFrom: plan.availableFrom || null,
        availableTo: plan.availableTo || null,
      })),
    },
  };
}

export const createProduct = asyncHandler(async (req, res) => {
  const input = productSchema.parse(req.body);
  const product = await prisma.$transaction((transaction) => transaction.product.create({
    data: { ...nestedData(input), createdById: req.user.sub },
    include: productInclude,
  }));
  return sendSuccess(res, product, {
    status: 201,
    message: "Product created.",
    warnings: productWarnings(product),
  });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const input = productSchema.parse(req.body);
  const product = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.product.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { variants: true, plans: true },
    });
    const planIds = input.plans.flatMap((plan) => plan.id ? [plan.id] : []);
    const removedPlans = existing.plans.filter((plan) => !planIds.includes(plan.id));
    if (removedPlans.length) {
      const usedPlan = await transaction.quotationTemplate.findFirst({
        where: { planId: { in: removedPlans.map((plan) => plan.id) } },
        select: { id: true },
      });
      if (usedPlan) {
        throw new HttpError(409, "A plan used by a quotation template cannot be removed. Keep the plan or update its details.");
      }
      await transaction.plan.deleteMany({ where: { id: { in: removedPlans.map((plan) => plan.id) } } });
    }

    await transaction.variant.deleteMany({
      where: {
        productId: req.params.id,
        ...(input.variants.some((variant) => variant.id)
          ? { id: { notIn: input.variants.flatMap((variant) => variant.id ? [variant.id] : []) } }
          : {}),
      },
    });
    const updated = await transaction.product.update({
      where: { id: req.params.id },
      data: {
        name: input.name,
        type: input.type,
        salesPrice: input.salesPrice.toFixed(2),
        costPrice: input.costPrice.toFixed(2),
        notes: input.notes || null,
        status: input.status,
        taxId: input.taxId || null,
      },
    });
    for (const variant of input.variants) {
      const { id, ...data } = variant;
      if (id) {
        if (!existing.variants.some((item) => item.id === id)) {
          throw new HttpError(400, "A variant does not belong to this product.");
        }
        await transaction.variant.update({
          where: { id },
          data: { ...data, extraPrice: data.extraPrice.toFixed(2) },
        });
      } else {
        await transaction.variant.create({
          data: { ...data, extraPrice: data.extraPrice.toFixed(2), productId: req.params.id },
        });
      }
    }
    for (const plan of input.plans) {
      const { id, ...data } = plan;
      const planData = {
        ...data,
        price: data.price.toFixed(2),
        availableFrom: data.availableFrom || null,
        availableTo: data.availableTo || null,
      };
      if (id) {
        if (!existing.plans.some((item) => item.id === id)) {
          throw new HttpError(400, "A plan does not belong to this product.");
        }
        await transaction.plan.update({ where: { id }, data: planData });
      } else {
        await transaction.plan.create({ data: { ...planData, productId: req.params.id } });
      }
    }
    return transaction.product.findUnique({ where: { id: updated.id }, include: productInclude });
  });
  return sendSuccess(res, product, {
    message: "Product updated.",
    warnings: productWarnings(product),
  });
});

export const updateProductStatus = asyncHandler(async (req, res) => {
  const { status } = productStatusSchema.parse(req.body);
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { status },
  });
  return sendSuccess(res, product, { message: "Product status updated." });
});

export const duplicateProduct = asyncHandler(async (req, res) => {
  const source = await prisma.product.findUnique({
    where: { id: req.params.id },
    include: { variants: true, plans: true },
  });
  if (!source) throw new HttpError(404, "Product not found.");
  const duplicate = await prisma.$transaction((transaction) => transaction.product.create({
    data: {
      name: `${source.name} copy`,
      type: source.type,
      salesPrice: source.salesPrice,
      costPrice: source.costPrice,
      notes: source.notes,
      status: "INACTIVE",
      taxId: source.taxId,
      createdById: req.user.sub,
      variants: {
        create: source.variants.map(({ attribute, value, extraPrice }) => ({
          attribute, value, extraPrice,
        })),
      },
      plans: {
        create: source.plans.map(({
          name, price, billingPeriod, minQuantity, availableFrom, availableTo,
          autoClose, allowEarlyClose, allowPause, allowRenew,
        }) => ({
          name, price, billingPeriod, minQuantity, availableFrom, availableTo,
          autoClose, allowEarlyClose, allowPause, allowRenew,
        })),
      },
    },
    include: productInclude,
  }));
  return sendSuccess(res, duplicate, { status: 201, message: "Product duplicated as inactive." });
});

export const bulkUpdateProducts = asyncHandler(async (req, res) => {
  const { ids, action } = bulkSchema.parse(req.body);
  const status = { activate: "ACTIVE", deactivate: "INACTIVE", archive: "ARCHIVED" }[action];
  const result = await prisma.product.updateMany({ where: { id: { in: ids } }, data: { status } });
  return sendSuccess(res, { updated: result.count }, { message: `${result.count} product(s) updated.` });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const id = req.params.id;
  try {
    await prisma.$transaction(async (transaction) => {
      const product = await transaction.product.findUnique({ where: { id }, select: { id: true } });
      if (!product) throw new HttpError(404, "Product not found.");
      const [subscription, templateLine] = await Promise.all([
        transaction.subscription.findFirst({ where: { productId: id }, select: { id: true } }),
        transaction.quotationTemplateLine.findFirst({ where: { productId: id }, select: { id: true } }),
      ]);
      if (subscription || templateLine) {
        throw new HttpError(409, "This product is used by a subscription or quotation template. Archive it instead.");
      }
      await transaction.product.delete({ where: { id } });
    });
  } catch (error) {
    if (error?.code === "P2003") {
      throw new HttpError(409, "This product is used by a subscription or quotation template. Archive it instead.");
    }
    throw error;
  }
  return sendSuccess(res, { id }, { message: "Product deleted." });
});
