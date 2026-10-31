import { z } from "zod";

export const templateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  validityDays: z.number().int().min(1).max(3650),
  productId: z.string().min(1),
  planId: z.string().min(1),
  lines: z.array(z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1).nullable().optional(),
    quantity: z.number().int().min(1),
  })).min(1),
});
