import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const password = await bcrypt.hash("Admin@1234", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@brightloop.com" },
    update: { name: "Brightloop Admin", password, role: "ADMIN" },
    create: {
      email: "admin@brightloop.com",
      name: "Brightloop Admin",
      password,
      role: "ADMIN",
    },
  });

  const [gst18, gst12, noTax] = await Promise.all([
    prisma.tax.upsert({
      where: { name: "GST 18%" },
      update: { ratePercent: "18.00" },
      create: { name: "GST 18%", ratePercent: "18.00" },
    }),
    prisma.tax.upsert({
      where: { name: "GST 12%" },
      update: { ratePercent: "12.00" },
      create: { name: "GST 12%", ratePercent: "12.00" },
    }),
    prisma.tax.upsert({
      where: { name: "No Tax" },
      update: { ratePercent: "0.00" },
      create: { name: "No Tax", ratePercent: "0.00" },
    }),
  ]);

  async function upsertProduct(name, data) {
    const existing = await prisma.product.findFirst({ where: { name } });
    if (existing) return prisma.product.update({ where: { id: existing.id }, data });
    return prisma.product.create({ data: { name, ...data } });
  }

  async function upsertVariant(productId, attribute, value, extraPrice) {
    const existing = await prisma.variant.findFirst({
      where: { productId, attribute, value },
    });
    const data = { attribute, value, extraPrice: extraPrice.toFixed(2) };
    if (existing) return prisma.variant.update({ where: { id: existing.id }, data });
    return prisma.variant.create({ data: { productId, ...data } });
  }

  async function upsertPlan(productId, name, data) {
    const existing = await prisma.plan.findFirst({ where: { productId, name } });
    if (existing) return prisma.plan.update({ where: { id: existing.id }, data });
    return prisma.plan.create({ data: { productId, name, ...data } });
  }

  const billingPro = await upsertProduct("Billing Pro", {
    type: "SOFTWARE",
    salesPrice: "1000.00",
    costPrice: "400.00",
    taxId: gst18.id,
    status: "ACTIVE",
    createdById: admin.id,
  });
  const [odoo, zoho, custom] = await Promise.all([
    upsertVariant(billingPro.id, "Brand", "Odoo", 560),
    upsertVariant(billingPro.id, "Brand", "Zoho", 300),
    upsertVariant(billingPro.id, "Brand", "Custom", 0),
  ]);
  const [monthlyPlan, yearlyPlan] = await Promise.all([
    upsertPlan(billingPro.id, "Monthly Plan", {
      price: "1000.00",
      billingPeriod: "MONTHLY",
      minQuantity: 1,
      availableFrom: new Date("2026-01-01T00:00:00.000Z"),
      availableTo: new Date("2026-12-31T23:59:59.999Z"),
    }),
    upsertPlan(billingPro.id, "Yearly Plan", {
      price: "10000.00",
      billingPeriod: "YEARLY",
      minQuantity: 1,
      availableFrom: new Date("2026-01-01T00:00:00.000Z"),
      availableTo: new Date("2027-12-31T23:59:59.999Z"),
    }),
  ]);
  await prisma.plan.deleteMany({
    where: {
      productId: billingPro.id,
      name: "Monthly plan",
      templates: { none: {} },
    },
  });

  const extraUserSeat = await upsertProduct("Extra User Seat", {
    type: "ADD_ON",
    salesPrice: "200.00",
    costPrice: "50.00",
    taxId: gst18.id,
    status: "ACTIVE",
    createdById: admin.id,
  });
  await upsertPlan(extraUserSeat.id, "Weekly Seat", {
    price: "50.00",
    billingPeriod: "WEEKLY",
    minQuantity: 5,
  });

  const prioritySupport = await upsertProduct("Priority Support", {
    type: "SERVICE",
    salesPrice: "2000.00",
    costPrice: "1200.00",
    taxId: noTax.id,
    status: "ACTIVE",
    createdById: admin.id,
  });
  await upsertPlan(prioritySupport.id, "Yearly Support", {
    price: "20000.00",
    billingPeriod: "YEARLY",
    minQuantity: 1,
  });

  async function upsertTemplate(name, validityDays, plan, lines) {
    await prisma.$transaction(async (transaction) => {
      const existing = await transaction.quotationTemplate.findFirst({ where: { name } });
      const template = existing
        ? await transaction.quotationTemplate.update({
          where: { id: existing.id },
          data: { validityDays, planId: plan.id },
        })
        : await transaction.quotationTemplate.create({
          data: { name, validityDays, planId: plan.id },
        });
      await transaction.quotationTemplateLine.deleteMany({
        where: { templateId: template.id },
      });
      await transaction.quotationTemplateLine.createMany({
        data: lines.map((line) => ({ templateId: template.id, ...line })),
      });
    });
  }

  await Promise.all([
    upsertTemplate("Small Shop Starter", 15, monthlyPlan, [
      { productId: billingPro.id, variantId: odoo.id, quantity: 3 },
    ]),
    upsertTemplate("Growth Team", 30, monthlyPlan, [
      { productId: billingPro.id, variantId: zoho.id, quantity: 10 },
      { productId: extraUserSeat.id, quantity: 5 },
    ]),
    upsertTemplate("Enterprise Annual", 60, yearlyPlan, [
      { productId: billingPro.id, variantId: custom.id, quantity: 50 },
      { productId: prioritySupport.id, quantity: 1 },
    ]),
  ]);

  console.log("Admin, tax rates, demo products, and quotation templates are ready.");
} catch (error) {
  console.error("Could not seed Brightloop data.", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
