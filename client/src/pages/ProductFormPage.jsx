import { forwardRef, useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BadgePercent, CalendarDays, Check, ChevronRight, Plus,
  Save, Trash2, TriangleAlert, X,
} from "lucide-react";
import { toast } from "sonner";
import { Button, ConfirmDialog, Field, GlassCard, PageHeading, Skeleton, StatusBadge, TabForm } from "../components/ui.jsx";
import { catalogApi, errorMessage, productApi } from "../lib/api.js";

const productTypes = [
  ["SOFTWARE", "Software"], ["ADD_ON", "Add-on"], ["SERVICE", "Service"], ["OTHER", "Other"],
];
const periods = [["DAILY", "Daily"], ["WEEKLY", "Weekly"], ["MONTHLY", "Monthly"], ["YEARLY", "Yearly"]];
const money = z.number({ invalid_type_error: "Enter an amount." }).finite().positive("Must be greater than zero.");
const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  type: z.enum(["SOFTWARE", "ADD_ON", "SERVICE", "OTHER"]),
  salesPrice: money,
  costPrice: money,
  notes: z.string().max(5000).optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "ARCHIVED"]),
  taxId: z.string().optional(),
  variants: z.array(z.object({
    id: z.string().optional(),
    attribute: z.string().trim().min(1, "Attribute is required."),
    value: z.string().trim().min(1, "Value is required."),
    extraPrice: z.number({ invalid_type_error: "Enter an amount." }).finite().min(0, "Cannot be negative."),
  })),
  plans: z.array(z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1, "Plan name is required."),
    price: money,
    billingPeriod: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"]),
    minQuantity: z.number({ invalid_type_error: "Enter a quantity." }).int().min(1),
    availableFrom: z.string().optional(),
    availableTo: z.string().optional(),
    autoClose: z.boolean(),
    allowEarlyClose: z.boolean(),
    allowPause: z.boolean(),
    allowRenew: z.boolean(),
  }).superRefine((plan, context) => {
    if (plan.availableFrom && plan.availableTo && plan.availableTo < plan.availableFrom) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["availableTo"], message: "End date cannot be before start date." });
    }
  })),
});

const initialValues = {
  name: "",
  type: "SOFTWARE",
  salesPrice: undefined,
  costPrice: undefined,
  notes: "",
  status: "ACTIVE",
  taxId: "",
  variants: [],
  plans: [],
};
const emptyTaxes = [];
const dollars = (amount) => `$${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";

const Toggle = forwardRef(function Toggle({ label, ...props }, ref) {
  return <label className="flex items-center justify-between gap-3 rounded-xl bg-white/55 px-3 py-2.5 text-xs font-medium text-[#68627b]">
    {label}<input ref={ref} type="checkbox" className="h-4 w-4 accent-[#7c5cf0]" {...props} />
  </label>;
});

function TemplateModal({ product, onClose }) {
  const [name, setName] = useState(`${product.name} quotation`);
  const [validityDays, setValidityDays] = useState(30);
  const [quantity, setQuantity] = useState(1);
  const [planId, setPlanId] = useState(product.plans[0]?.id || "");
  const [variantId, setVariantId] = useState("");
  const mutation = useMutation({
    mutationFn: catalogApi.createTemplate,
    onSuccess: () => { toast.success("Quotation template created."); onClose(); },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#292342]/35 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" className="glass-card w-full max-w-lg rounded-3xl p-6">
      <div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-[#897aba]">Quotation setup</p><h2 className="mt-1 text-xl font-semibold text-[#38334d]">Create template</h2></div><button aria-label="Close" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-white/70"><X size={16} /></button></div>
      <form className="space-y-4" onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate({
          name, validityDays: Number(validityDays), productId: product.id, planId,
          lines: [{ productId: product.id, variantId: variantId || null, quantity: Number(quantity) }],
        });
      }}>
        <Field label="Template name"><input className="soft-input" value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label="Validity (days)"><input className="soft-input" type="number" min="1" max="3650" value={validityDays} onChange={(event) => setValidityDays(event.target.value)} required /></Field>
        <Field label="Quantity"><input className="soft-input" type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></Field>
        <Field label="Plan"><select className="soft-input" value={planId} onChange={(event) => setPlanId(event.target.value)} required><option value="" disabled>Select a plan</option>{product.plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {dollars(plan.price)} / {plan.billingPeriod.toLowerCase()}</option>)}</select></Field>
        <Field label="Quotation line variant"><select className="soft-input" value={variantId} onChange={(event) => setVariantId(event.target.value)}><option value="">Base product</option>{product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.attribute}: {variant.value}</option>)}</select></Field>
        <div className="flex justify-end gap-2 pt-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button disabled={mutation.isPending || !planId}>{mutation.isPending ? "Creating…" : "Create template"}</Button></div>
      </form>
    </div>
  </div>;
}

function PreviewCard({ salesPrice, variants, tax, selectedVariant, setSelectedVariant }) {
  const variant = variants.find((item) => item.id === selectedVariant) || variants[selectedVariant] || null;
  const base = Number(salesPrice) || 0;
  const extra = Number(variant?.extraPrice) || 0;
  const subtotal = base + extra;
  const taxAmount = subtotal * (Number(tax?.ratePercent) || 0) / 100;
  return <GlassCard className="sticky top-5">
    <p className="text-xs font-semibold uppercase tracking-[.13em] text-[#918ba6]">Live price preview</p>
    <h3 className="mt-1 text-lg font-semibold text-[#38334d]">Price summary</h3>
    {variants.length > 0 && <Field label="Variant">
      <select className="soft-input mt-2" value={selectedVariant} onChange={(event) => setSelectedVariant(event.target.value)}>
        <option value="">Base product</option>
        {variants.map((item, index) => <option key={item.id || index} value={item.id || index}>{item.attribute}: {item.value}</option>)}
      </select>
    </Field>}
    <div className="mt-5 space-y-3 text-sm">
      <div className="flex justify-between text-[#77718a]"><span>Base price</span><span>{dollars(base)}</span></div>
      {variant && <div className="flex justify-between text-[#77718a]"><span>{variant.attribute}: {variant.value}</span><span>+ {dollars(extra)}</span></div>}
      <div className="flex justify-between border-t border-[#e9e4f3] pt-3 font-semibold text-[#514a66]"><span>Subtotal</span><span>{dollars(subtotal)}</span></div>
      <div className="flex justify-between text-[#77718a]"><span>{tax ? `${tax.name} (${Number(tax.ratePercent)}%)` : "Tax"}</span><span>{dollars(taxAmount)}</span></div>
      <div className="rounded-2xl bg-[#ede7ff] p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#6954a7]">Estimated total</span><BadgePercent size={16} className="text-[#805ff0]" /></div><p className="mt-2 text-2xl font-semibold text-[#563eb1]">{dollars(subtotal + taxAmount)}</p></div>
      {variant && <p className="text-[11px] text-[#938ba9]">{dollars(base)} + {dollars(extra)} = {dollars(subtotal)}</p>}
    </div>
  </GlassCard>;
}

export function ProductFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("general");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [selectedVariant, setSelectedVariant] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const allowNavigation = useRef(false);
  const detail = useQuery({ queryKey: ["product", id], queryFn: () => productApi.get(id), enabled: isEdit });
  const taxesQuery = useQuery({ queryKey: ["taxes"], queryFn: catalogApi.taxes });
  const taxes = taxesQuery.data || emptyTaxes;
  useEffect(() => {
    if (taxesQuery.isError) toast.error(`Taxes could not be loaded: ${errorMessage(taxesQuery.error)}`);
  }, [taxesQuery.isError, taxesQuery.error]);
  const {
    control, register, handleSubmit, reset, getValues, setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({ resolver: zodResolver(formSchema), defaultValues: initialValues });
  const variantsArray = useFieldArray({ control, name: "variants" });
  const plansArray = useFieldArray({ control, name: "plans" });
  const values = useWatch({ control });
  const variants = values.variants || [];
  const plans = values.plans || [];
  const salesPrice = values.salesPrice || 0;
  const costPrice = values.costPrice || 0;
  const margin = Number(salesPrice) - Number(costPrice);
  const marginPercent = Number(salesPrice) ? margin / Number(salesPrice) * 100 : 0;
  const selectedTax = taxes.find((tax) => tax.id === values.taxId);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    isDirty && !allowNavigation.current && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!detail.data || taxesQuery.isLoading) return;
    const product = detail.data;
    reset({
      name: product.name,
      type: product.type,
      salesPrice: Number(product.salesPrice),
      costPrice: Number(product.costPrice),
      notes: product.notes || "",
      status: product.status,
      taxId: product.taxId || taxes.find((tax) => tax.name === "No Tax")?.id || "",
      variants: product.variants.map((variant) => ({ ...variant, extraPrice: Number(variant.extraPrice) })),
      plans: product.plans.map((plan) => ({
        ...plan,
        price: Number(plan.price),
        availableFrom: dateValue(plan.availableFrom),
        availableTo: dateValue(plan.availableTo),
      })),
    });
  }, [detail.data, reset, taxes, taxesQuery.isLoading]);

  useEffect(() => {
    if (isEdit || taxesQuery.isLoading || !taxes.length || getValues("taxId")) return;
    const defaultTax = taxes.find((tax) => tax.name === "GST 18%");
    if (defaultTax) setValue("taxId", defaultTax.id, { shouldDirty: false });
  }, [getValues, isEdit, setValue, taxes, taxesQuery.isLoading]);

  useEffect(() => {
    const warn = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const mutation = useMutation({
    mutationFn: (data) => isEdit ? productApi.update(id, data) : productApi.create(data),
    onSuccess: (result) => {
      toast.success(result.message);
      if (result.warnings?.length) result.warnings.forEach((warning) => toast.warning(warning));
      reset(values);
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product", id] });
      allowNavigation.current = true;
      navigate("/products");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const save = handleSubmit((data) => {
    if (isEdit && data.status === "ARCHIVED" && detail.data?._count?.subscriptions && !archiveConfirm?.approved) {
      setPendingData(data);
      setArchiveConfirm({ approved: false });
      return;
    }
    const payload = {
      ...data,
      taxId: data.taxId || null,
      variants: data.variants,
      plans: data.plans.map((plan) => ({
        ...plan,
        availableFrom: plan.availableFrom ? new Date(`${plan.availableFrom}T00:00:00.000Z`).toISOString() : null,
        availableTo: plan.availableTo ? new Date(`${plan.availableTo}T00:00:00.000Z`).toISOString() : null,
      })),
    };
    mutation.mutate(payload);
  });

  const activeTab = (name) => setTab(name);
  if (isEdit && detail.isLoading) return <div className="grid gap-5 lg:grid-cols-[1fr_320px]"><Skeleton className="h-[620px]" /><Skeleton className="h-72" /></div>;
  if (isEdit && detail.isError) return <GlassCard><p className="font-semibold text-rose-700">This product couldn’t be loaded.</p><p className="mt-2 text-sm text-[#817b91]">{errorMessage(detail.error)}</p><Link to="/products" className="action-button mt-4 inline-flex items-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2.5 text-sm font-semibold text-[#55506c] hover:bg-white"><ArrowLeft size={15} /> Back to products</Link></GlassCard>;

  const actions = <div className="flex flex-wrap gap-2">
    {isEdit && <Button variant="secondary" type="button" onClick={() => setTemplateOpen(true)} disabled={!plans.length}>Create quotation template</Button>}
    <Link to="/products" className="action-button inline-flex items-center justify-center gap-2 rounded-full border border-white/80 bg-white/70 px-4 py-2.5 text-sm font-semibold text-[#55506c] hover:bg-white"><X size={15} /> Cancel</Link>
    <Button type="submit" form="product-form" disabled={mutation.isPending || isSubmitting}><Save size={15} />{mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create product"}</Button>
  </div>;

  return <>
    <PageHeading eyebrow={isEdit ? "Product details" : "Catalog setup"} title={isEdit ? <>Edit <strong className="font-semibold">product</strong></> : <>Create a <strong className="font-semibold">product</strong></>} description={isEdit ? "Update pricing, variants, and subscription plans." : "Set up a product and the plans you want to offer."} action={actions} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <form id="product-form" onSubmit={save} className="min-w-0">
        <GlassCard className="!p-4 sm:!p-6">
          <TabForm
            tabs={[
              { id: "general", label: "General" },
              { id: "variants", label: "Variants", count: variantsArray.fields.length },
              { id: "plans", label: "Plans", count: plansArray.fields.length },
            ]}
            activeTab={tab}
            onChange={activeTab}
          />
          {tab === "general" && <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" error={errors.name?.message}><input className="soft-input" placeholder="e.g. Brightloop Starter" {...register("name")} /></Field>
              <Field label="Type" error={errors.type?.message}><select className="soft-input" {...register("type")}>{productTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
              <Field label="Sales price" error={errors.salesPrice?.message}><div className="relative"><span className="absolute left-3.5 top-3 text-sm text-[#9a94aa]">$</span><input className="soft-input input-with-prefix" type="number" min="0.01" step="0.01" {...register("salesPrice", { valueAsNumber: true })} /></div></Field>
              <Field label="Cost price" error={errors.costPrice?.message}><div className="relative"><span className="absolute left-3.5 top-3 text-sm text-[#9a94aa]">$</span><input className="soft-input input-with-prefix" type="number" min="0.01" step="0.01" {...register("costPrice", { valueAsNumber: true })} /></div></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f3effb] px-4 py-3">
              <div><p className="text-xs font-semibold text-[#7d7691]">Estimated margin</p><p className="mt-1 text-lg font-semibold text-[#4c416f]">{dollars(margin)} <span className="text-sm font-medium text-[#887eaa]">({marginPercent.toFixed(1)}%)</span></p></div>
              {margin < 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800"><TriangleAlert size={14} /> Sales price is below cost</span>}
            </div>
            <Field label="Notes" error={errors.notes?.message}><textarea className="soft-input min-h-28 resize-y" placeholder="Add helpful details about this product…" {...register("notes")} /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tax"><select className="soft-input" {...register("taxId")}>{taxes.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} · {Number(tax.ratePercent)}%</option>)}</select></Field>
              <Field label="Status"><select className="soft-input" {...register("status")}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option></select></Field>
            </div>
            {isEdit && <div className="rounded-2xl border border-white/80 bg-white/45 p-4">
              <div className="flex items-center justify-between"><p className="text-sm font-semibold text-[#514a66]">Audit information</p><StatusBadge status={detail.data.status} /></div>
              <div className="mt-3 grid gap-2 text-xs text-[#817b91] sm:grid-cols-3">
                <p><span className="block text-[#aaa4b4]">Created by</span>{detail.data.createdBy?.name} · {detail.data.createdBy?.email}</p>
                <p><span className="block text-[#aaa4b4]">Created on</span>{new Date(detail.data.createdAt).toLocaleString()}</p>
                <p><span className="block text-[#aaa4b4]">Last edited</span>{new Date(detail.data.updatedAt).toLocaleString()}</p>
              </div>
            </div>}
          </div>}
          {tab === "variants" && <div>
            <div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="font-semibold text-[#3d3852]">Product variants</h2><p className="mt-1 text-xs text-[#928ca2]">Extra prices are added to the product’s base sales price.</p></div><Button type="button" variant="secondary" onClick={() => variantsArray.append({ attribute: "", value: "", extraPrice: 0 })}><Plus size={15} /> Add variant</Button></div>
            {variantsArray.fields.length === 0 && <div className="rounded-2xl border border-dashed border-[#d8d1ec] p-10 text-center"><p className="font-semibold text-[#5b5571]">No variants yet</p><p className="mt-1 text-xs text-[#9993a8]">Add options like Brand, Edition, or Region.</p></div>}
            <div className="space-y-3">{variantsArray.fields.map((field, index) => <div key={field.id} className="grid gap-3 rounded-2xl bg-white/55 p-3 sm:grid-cols-[1fr_1fr_140px_40px]">
              <input type="hidden" {...register(`variants.${index}.id`)} />
              <Field label="Attribute" error={errors.variants?.[index]?.attribute?.message}><input className="soft-input" placeholder="Brand" {...register(`variants.${index}.attribute`)} /></Field>
              <Field label="Value" error={errors.variants?.[index]?.value?.message}><input className="soft-input" placeholder="Odoo" {...register(`variants.${index}.value`)} /></Field>
              <Field label="Extra price" error={errors.variants?.[index]?.extraPrice?.message}><input className="soft-input" type="number" min="0" step="0.01" {...register(`variants.${index}.extraPrice`, { valueAsNumber: true })} /></Field>
              <div className="flex items-end"><button type="button" aria-label="Remove variant" onClick={() => variantsArray.remove(index)} className="mb-0.5 grid h-10 w-10 place-items-center rounded-full text-rose-500 hover:bg-rose-50"><Trash2 size={16} /></button></div>
              <p className="text-[11px] text-[#887fa0] sm:col-span-3">Final price: {dollars(salesPrice)} + {dollars(variants[index]?.extraPrice)} = <strong className="text-[#644cb7]">{dollars(Number(salesPrice) + Number(variants[index]?.extraPrice || 0))}</strong></p>
            </div>)}</div>
          </div>}
          {tab === "plans" && <div>
            <div className="mb-4 flex items-center justify-between gap-2"><div><h2 className="font-semibold text-[#3d3852]">Subscription plans</h2><p className="mt-1 text-xs text-[#928ca2]">Choose a billing cadence and plan availability.</p></div><Button type="button" variant="secondary" onClick={() => plansArray.append({ name: "", price: Number(salesPrice) || undefined, billingPeriod: "MONTHLY", minQuantity: 1, availableFrom: "", availableTo: "", autoClose: false, allowEarlyClose: false, allowPause: false, allowRenew: true })}><Plus size={15} /> Add plan</Button></div>
            {plansArray.fields.length === 0 && <div className="rounded-2xl border border-dashed border-[#d8d1ec] p-10 text-center"><p className="font-semibold text-[#5b5571]">No plans yet</p><p className="mt-1 text-xs text-[#9993a8]">Add plans so your team can use them in quotation templates.</p></div>}
            <div className="space-y-4">{plansArray.fields.map((field, index) => <div key={field.id} className="rounded-2xl border border-white/80 bg-white/55 p-4">
              <input type="hidden" {...register(`plans.${index}.id`)} />
              <div className="mb-3 flex items-center justify-between"><p className="text-sm font-semibold text-[#5b5571]">Plan {index + 1}</p><button type="button" aria-label="Remove plan" onClick={() => plansArray.remove(index)} className="grid h-8 w-8 place-items-center rounded-full text-rose-500 hover:bg-rose-50"><Trash2 size={15} /></button></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Plan name" error={errors.plans?.[index]?.name?.message}><input className="soft-input" placeholder="Monthly plan" {...register(`plans.${index}.name`)} /></Field>
                <Field label="Price" error={errors.plans?.[index]?.price?.message}><input className="soft-input" type="number" min="0.01" step="0.01" {...register(`plans.${index}.price`, { valueAsNumber: true })} /></Field>
                <Field label="Billing period"><select className="soft-input" {...register(`plans.${index}.billingPeriod`)}>{periods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
                <Field label="Minimum quantity" error={errors.plans?.[index]?.minQuantity?.message}><input className="soft-input" type="number" min="1" step="1" {...register(`plans.${index}.minQuantity`, { valueAsNumber: true })} /></Field>
                <Field label="Available from"><input className="soft-input" type="date" {...register(`plans.${index}.availableFrom`)} /></Field>
                <Field label="Available to" error={errors.plans?.[index]?.availableTo?.message}><input className="soft-input" type="date" {...register(`plans.${index}.availableTo`)} /></Field>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Toggle label="Auto-close at end" {...register(`plans.${index}.autoClose`)} />
                <Toggle label="Allow early close" {...register(`plans.${index}.allowEarlyClose`)} />
                <Toggle label="Allow pause" {...register(`plans.${index}.allowPause`)} />
                <Toggle label="Allow renew" {...register(`plans.${index}.allowRenew`)} />
              </div>
            </div>)}</div>
          </div>}
          {Object.keys(errors).length > 0 && <div className="mt-5 rounded-xl bg-rose-50 px-4 py-3 text-xs text-rose-700">Review the highlighted fields before saving.</div>}
        </GlassCard>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2">{tab !== "general" && <Button variant="secondary" type="button" onClick={() => activeTab(tab === "plans" ? "variants" : "general")}><ArrowLeft size={15} /> Previous</Button>}{tab !== "plans" && <Button variant="secondary" type="button" onClick={() => activeTab(tab === "general" ? "variants" : "plans")}>Next <ChevronRight size={15} /></Button>}</div>
          <Button type="submit" form="product-form" disabled={mutation.isPending || isSubmitting}><Save size={15} />{mutation.isPending ? "Saving…" : "Save product"}</Button>
        </div>
      </form>
      <div className="space-y-4">
        <PreviewCard salesPrice={salesPrice} variants={variants} tax={selectedTax} selectedVariant={selectedVariant} setSelectedVariant={setSelectedVariant} />
        {isEdit && detail.data?._count?.subscriptions > 0 && <GlassCard className="border-amber-100 bg-amber-50/65">
          <div className="flex gap-2 text-amber-800"><CalendarDays size={17} /><div><p className="text-sm font-semibold">Active subscriptions</p><p className="mt-1 text-xs leading-5 text-amber-800/80">{detail.data._count.subscriptions} active subscription(s) use this product. Archiving will not change existing subscriptions.</p></div></div>
        </GlassCard>}
      </div>
    </div>
    {templateOpen && <TemplateModal product={{ ...detail.data, plans }} onClose={() => setTemplateOpen(false)} />}
    <ConfirmDialog
      open={Boolean(archiveConfirm)}
      title="Archive a product with active subscriptions?"
      description={`This product is used by ${detail.data?._count?.subscriptions || 0} active subscription(s). Archiving only affects the product catalog; existing subscriptions remain unchanged.`}
      confirmLabel="Save as archived"
      onCancel={() => { setArchiveConfirm(null); setPendingData(null); }}
      onConfirm={() => {
        const data = pendingData;
        setArchiveConfirm(null);
        setPendingData(null);
        if (data) {
          const payload = {
            ...data,
            taxId: data.taxId || null,
            plans: data.plans.map((plan) => ({
              ...plan,
              availableFrom: plan.availableFrom ? new Date(`${plan.availableFrom}T00:00:00.000Z`).toISOString() : null,
              availableTo: plan.availableTo ? new Date(`${plan.availableTo}T00:00:00.000Z`).toISOString() : null,
            })),
          };
          mutation.mutate(payload);
        }
      }}
    />
    <ConfirmDialog
      open={blocker.state === "blocked"}
      title="Discard unsaved changes?"
      description="Your product edits haven’t been saved. Leave this page and discard them?"
      confirmLabel="Leave page"
      danger
      onCancel={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
    />
  </>;
}
