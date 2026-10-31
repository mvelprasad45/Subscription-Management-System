import { z } from "zod";

const money = z.number().finite().positive();
const date = z.string().datetime().nullable().optional();

export const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  type: z.enum(["SOFTWARE", "ADD_ON", "SERVICE", "OTHER"]),
  salesPrice: money,
  costPrice: money,
  notes: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).default("ACTIVE"),
  taxId: z.string().nullable().optional(),
  variants: z.array(z.object({
    id: z.string().optional(),
    attribute: z.string().trim().min(1).max(80),
    value: z.string().trim().min(1).max(120),
    extraPrice: z.number().finite().min(0),
  })).default([]),
  plans: z.array(z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    price: z.number().finite().positive(),
    billingPeriod: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    minQuantity: z.number().int().min(1).default(1),
    availableFrom: date,
    availableTo: date,
    autoClose: z.boolean().default(false),
    allowEarlyClose: z.boolean().default(false),
    allowPause: z.boolean().default(false),
    allowRenew: z.boolean().default(true),
  }).superRefine((plan, context) => {
    if (plan.availableFrom && plan.availableTo &&
      new Date(plan.availableTo) < new Date(plan.availableFrom)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["availableTo"],
        message: "End date cannot be before start date.",
      });
    }
  })).default([]),
});

export const productStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
});

export const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum(["activate", "deactivate", "archive"]),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().default(""),
  type: z.enum(["SOFTWARE", "ADD_ON", "SERVICE", "OTHER"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  sortBy: z.enum(["name", "type", "salesPrice", "costPrice", "margin", "variantCount", "status", "createdAt"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});
