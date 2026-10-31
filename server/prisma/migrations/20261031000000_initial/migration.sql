CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'CUSTOMER');
CREATE TYPE "ProductType" AS ENUM ('SOFTWARE', 'ADD_ON', 'SERVICE', 'OTHER');
CREATE TYPE "ProductStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "BillingPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'CANCELLED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Tax" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ratePercent" DECIMAL(5,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ProductType" NOT NULL,
  "salesPrice" DECIMAL(10,2) NOT NULL,
  "costPrice" DECIMAL(10,2) NOT NULL,
  "notes" TEXT,
  "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
  "taxId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Variant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "attribute" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "extraPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "Variant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Plan" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(10,2) NOT NULL,
  "billingPeriod" "BillingPeriod" NOT NULL,
  "minQuantity" INTEGER NOT NULL DEFAULT 1,
  "availableFrom" TIMESTAMP(3),
  "availableTo" TIMESTAMP(3),
  "autoClose" BOOLEAN NOT NULL DEFAULT false,
  "allowEarlyClose" BOOLEAN NOT NULL DEFAULT false,
  "allowPause" BOOLEAN NOT NULL DEFAULT false,
  "allowRenew" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuotationTemplate" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "validityDays" INTEGER NOT NULL,
  "planId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuotationTemplate_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "QuotationTemplateLine" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "variantId" TEXT,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "QuotationTemplateLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_status_idx" ON "Product"("status");
CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");
CREATE INDEX "Product_taxId_idx" ON "Product"("taxId");
CREATE INDEX "Product_createdById_idx" ON "Product"("createdById");
CREATE INDEX "Variant_productId_idx" ON "Variant"("productId");
CREATE INDEX "Plan_productId_idx" ON "Plan"("productId");
CREATE INDEX "QuotationTemplate_planId_idx" ON "QuotationTemplate"("planId");
CREATE INDEX "QuotationTemplateLine_templateId_idx" ON "QuotationTemplateLine"("templateId");
CREATE INDEX "QuotationTemplateLine_productId_idx" ON "QuotationTemplateLine"("productId");
CREATE INDEX "QuotationTemplateLine_variantId_idx" ON "QuotationTemplateLine"("variantId");
CREATE INDEX "Subscription_productId_status_idx" ON "Subscription"("productId", "status");
ALTER TABLE "Product" ADD CONSTRAINT "Product_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Product" ADD CONSTRAINT "Product_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Variant" ADD CONSTRAINT "Variant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Plan" ADD CONSTRAINT "Plan_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationTemplate" ADD CONSTRAINT "QuotationTemplate_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "QuotationTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuotationTemplateLine" ADD CONSTRAINT "QuotationTemplateLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
