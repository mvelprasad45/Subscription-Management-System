import { prisma } from "../lib/prisma.js";
import { asyncHandler, HttpError, sendSuccess } from "../lib/http.js";
import { templateSchema } from "../validators/templates.js";

export const listTaxes = asyncHandler(async (_req, res) => {
  const taxes = await prisma.tax.findMany({ orderBy: { name: "asc" } });
  return sendSuccess(res, taxes);
});

export const listTemplates = asyncHandler(async (_req, res) => {
  const templates = await prisma.quotationTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      plan: { select: { id: true, productId: true, name: true, price: true, billingPeriod: true } },
      lines: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              salesPrice: true,
              tax: { select: { id: true, name: true, ratePercent: true } },
            },
          },
          variant: { select: { id: true, attribute: true, value: true, extraPrice: true } },
        },
      },
    },
  });
  return sendSuccess(res, templates);
});

async function validateTemplateReferences(input) {
  const plan = await prisma.plan.findUnique({
    where: { id: input.planId },
    select: { productId: true },
  });
  if (!plan || plan.productId !== input.productId) {
    throw new HttpError(400, "Choose a plan that belongs to the selected product.");
  }
  for (const line of input.lines) {
    const product = await prisma.product.findUnique({
      where: { id: line.productId },
      select: { id: true, variants: { select: { id: true } } },
    });
    if (!product) throw new HttpError(400, "A quotation line references a product that does not exist.");
    if (line.variantId && !product.variants.some((variant) => variant.id === line.variantId)) {
      throw new HttpError(400, "A quotation line variant does not belong to its product.");
    }
  }
}

const templateInclude = {
  plan: true,
  lines: {
    include: {
      product: { include: { tax: true } },
      variant: true,
    },
  },
};

export const createTemplate = asyncHandler(async (req, res) => {
  const input = templateSchema.parse(req.body);
  await validateTemplateReferences(input);
  const template = await prisma.$transaction((transaction) => transaction.quotationTemplate.create({
    data: {
      name: input.name,
      validityDays: input.validityDays,
      planId: input.planId,
      lines: { create: input.lines },
    },
    include: templateInclude,
  }));
  return sendSuccess(res, template, { status: 201, message: "Quotation template created." });
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const input = templateSchema.parse(req.body);
  await validateTemplateReferences(input);
  const template = await prisma.$transaction(async (transaction) => {
    await transaction.quotationTemplate.findUniqueOrThrow({
      where: { id: req.params.id },
      select: { id: true },
    });
    await transaction.quotationTemplateLine.deleteMany({
      where: { templateId: req.params.id },
    });
    return transaction.quotationTemplate.update({
      where: { id: req.params.id },
      data: {
        name: input.name,
        validityDays: input.validityDays,
        planId: input.planId,
        lines: { create: input.lines },
      },
      include: templateInclude,
    });
  });
  return sendSuccess(res, template, { message: "Quotation template updated." });
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  await prisma.quotationTemplate.delete({ where: { id: req.params.id } });
  return sendSuccess(res, { id: req.params.id }, { message: "Quotation template deleted." });
});
