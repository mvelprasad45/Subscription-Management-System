import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Files, Hourglass, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button, ConfirmDialog, DataTable, Field, GlassCard, IconButton, PageHeading, Skeleton } from "../components/ui.jsx";
import { catalogApi, errorMessage, productApi } from "../lib/api.js";

const currencyPeriod = (period) => ({
  DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year",
}[period] || period?.toLowerCase());
const dollars = (value) => `$${Number(value || 0).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

function NewTemplateDialog({ template, onClose }) {
  const queryClient = useQueryClient();
  const editing = Boolean(template);
  const [name, setName] = useState(template?.name || "");
  const [validityDays, setValidityDays] = useState(template?.validityDays || 30);
  const [productId, setProductId] = useState(template?.plan?.productId || "");
  const [planId, setPlanId] = useState(template?.planId || template?.plan?.id || "");
  const [lines, setLines] = useState(() => template?.lines?.map((line) => ({
    productId: line.productId,
    variantId: line.variantId || "",
    quantity: line.quantity,
  })) || [{ productId: "", variantId: "", quantity: 1 }]);

  const productsQuery = useQuery({
    queryKey: ["template-products"],
    queryFn: () => productApi.list({ page: 1, limit: 100, status: "ACTIVE", sortBy: "name", order: "asc" })
      .then((response) => response.data.products),
  });
  const productIds = useMemo(() => [...new Set([
    productId,
    ...lines.map((line) => line.productId),
  ].filter(Boolean))], [productId, lines]);
  const detailQueries = useQueries({
    queries: productIds.map((id) => ({
      queryKey: ["product", id],
      queryFn: () => productApi.get(id),
    })),
  });
  const productDetails = useMemo(() => Object.fromEntries(
    productIds.map((id, index) => [id, detailQueries[index]?.data]),
  ), [productIds, detailQueries]);
  const planOptions = productDetails[productId]?.plans || [];

  useEffect(() => {
    if (productId && !planOptions.some((plan) => plan.id === planId)) {
      setPlanId(planOptions[0]?.id || "");
    }
  }, [productId, planId, planOptions]);

  const mutation = useMutation({
    mutationFn: (data) => editing
      ? catalogApi.updateTemplate(template.id, data)
      : catalogApi.createTemplate(data),
    onSuccess: (result) => {
      toast.success(result.message);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function updateLine(index, changes) {
    setLines((current) => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, ...changes } : line));
  }

  function submit(event) {
    event.preventDefault();
    mutation.mutate({
      name,
      validityDays: Number(validityDays),
      productId,
      planId,
      lines: lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId || null,
        quantity: Number(line.quantity),
      })),
    });
  }

  const ready = name.trim() && Number(validityDays) >= 1 && productId && planId &&
    lines.length > 0 && lines.every((line) => line.productId && Number(line.quantity) >= 1) &&
    !mutation.isPending;

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#292342]/35 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" aria-labelledby="template-dialog-title" className="glass-card max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 sm:p-7">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#897aba]">Quotation setup</p>
          <h2 id="template-dialog-title" className="mt-1 text-xl font-semibold text-[#38334d]">{editing ? "Edit template" : "New template"}</h2>
        </div>
        <IconButton label="Close" onClick={onClose}><span aria-hidden="true">×</span></IconButton>
      </div>
      {productsQuery.isError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">Products could not be loaded: {errorMessage(productsQuery.error)}</p>}
      {productsQuery.data?.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Create an active product with a plan before creating a quotation template.</p>}
      <form className="space-y-5" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Template name">
            <input className="soft-input" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} />
          </Field>
          <Field label="Validity (days)">
            <input className="soft-input" type="number" min="1" max="3650" value={validityDays} onChange={(event) => setValidityDays(event.target.value)} required />
          </Field>
          <Field label="Plan product">
            <select className="soft-input" value={productId} onChange={(event) => { setProductId(event.target.value); setPlanId(""); }} required>
              <option value="">Select a product</option>
              {(productsQuery.data || []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </Field>
          <Field label="Plan">
            <select className="soft-input" value={planId} onChange={(event) => setPlanId(event.target.value)} required disabled={!productId}>
              <option value="">Select a plan</option>
              {planOptions.map((plan) => <option key={plan.id} value={plan.id}>{plan.name} · {dollars(plan.price)} / {currencyPeriod(plan.billingPeriod)}</option>)}
            </select>
          </Field>
        </div>

        <div className="rounded-2xl border border-white/70 bg-white/25 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-sm font-semibold text-[#514a66]">Quotation lines</h3><p className="mt-1 text-xs text-[#8a849b]">Select products, optional variants, and quantities.</p></div>
            <Button type="button" variant="secondary" className="!py-2 !text-xs" onClick={() => setLines((current) => [...current, { productId: "", variantId: "", quantity: 1 }])}>
              <Plus size={14} /> Add line
            </Button>
          </div>
          <div className="space-y-3">
            {lines.map((line, index) => {
              const details = productDetails[line.productId];
              return <div key={index} className="grid gap-3 rounded-xl bg-white/50 p-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_100px_38px]">
                <Field label="Product">
                  <select className="soft-input" value={line.productId} onChange={(event) => updateLine(index, { productId: event.target.value, variantId: "" })} required>
                    <option value="">Select product</option>
                    {(productsQuery.data || []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                  </select>
                </Field>
                <Field label="Variant">
                  <select className="soft-input" value={line.variantId} onChange={(event) => updateLine(index, { variantId: event.target.value })} disabled={!line.productId}>
                    <option value="">Base product</option>
                    {(details?.variants || []).map((variant) => <option key={variant.id} value={variant.id}>{variant.attribute}: {variant.value}</option>)}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input className="soft-input" type="number" min="1" step="1" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} required />
                </Field>
                <div className="flex items-end">
                  <IconButton label="Remove line" className="mb-0.5 text-rose-500" onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} disabled={lines.length === 1}>
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              </div>;
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!ready}>{mutation.isPending ? "Saving…" : editing ? "Save changes" : "Create template"}</Button>
        </div>
      </form>
    </div>
  </div>;
}

function estimateTotal(template) {
  return template.lines.reduce((total, line) => {
    const unitPrice = Number(line.product.salesPrice) + Number(line.variant?.extraPrice || 0);
    const rate = Number(line.product.tax?.ratePercent || 0);
    return total + unitPrice * Number(line.quantity) * (1 + rate / 100);
  }, 0);
}

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["templates"], queryFn: catalogApi.templates });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const removeMutation = useMutation({
    mutationFn: catalogApi.deleteTemplate,
    onSuccess: (result) => {
      toast.success(result.message);
      setDeleting(null);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  useEffect(() => {
    if (query.isError) toast.error(errorMessage(query.error));
  }, [query.isError, query.error]);

  return <>
    <PageHeading
      eyebrow="Reusable quotations"
      title={<>Quotation <strong className="font-semibold">templates</strong></>}
      description="Build consistent quotations from your product plans."
      action={<Button onClick={() => setEditing({})}><Plus size={16} /> New Template</Button>}
    />
    {query.isLoading && <GlassCard><div className="space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-14" key={index} />)}</div></GlassCard>}
    {query.isError && <GlassCard><p className="font-semibold text-rose-700">Templates couldn’t be loaded.</p><p className="mt-1 text-sm text-[#817b91]">{errorMessage(query.error)}</p><Button variant="secondary" className="mt-3" onClick={() => query.refetch()}>Try again</Button></GlassCard>}
    {query.data?.length === 0 && <GlassCard className="py-16 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#ede7ff] text-[#7c5cf0]"><Files size={23} /></div>
      <h2 className="mt-4 font-semibold text-[#403b54]">No quotation templates yet</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-[#938da2]">Create a template to save a reusable product and plan combination.</p>
      <Button className="mt-4" onClick={() => setEditing({})}><Plus size={15} /> New Template</Button>
    </GlassCard>}
    {query.data?.length > 0 && <GlassCard className="!p-4 sm:!p-6">
      <DataTable className="[&>table]:min-w-[940px]">
        <thead><tr className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9993a8]">
          <th className="px-3 pb-1">Name</th><th className="px-3 pb-1">Validity (days)</th><th className="px-3 pb-1">Plan</th><th className="px-3 pb-1">Lines</th><th className="px-3 pb-1">Estimated total (with tax)</th><th className="px-3 pb-1 text-right">Actions</th>
        </tr></thead>
        <tbody>{query.data.map((template) => <tr key={template.id} className="bg-white/70 text-sm transition hover:bg-white">
          <td className="rounded-l-2xl px-3 py-4"><span className="font-semibold text-[#433b5f]">{template.name}</span><p className="mt-0.5 text-[11px] text-[#a19bad]">{template.lines.map((line) => `${line.product.name}${line.variant ? ` · ${line.variant.value}` : ""} × ${line.quantity}`).join(" · ")}</p></td>
          <td className="px-3 py-4"><span className="inline-flex items-center gap-1.5 text-[#6d6680]"><Hourglass size={14} />{template.validityDays}</span></td>
          <td className="px-3 py-4"><span className="font-medium text-[#514a66]">{template.plan?.name}</span><p className="mt-0.5 text-[11px] text-[#918ba0]">{currencyPeriod(template.plan?.billingPeriod)} · {dollars(template.plan?.price)}</p></td>
          <td className="px-3 py-4 text-[#706b80]">{template.lines.length}</td>
          <td className="px-3 py-4 font-semibold text-[#514a66]">{dollars(estimateTotal(template))}</td>
          <td className="rounded-r-2xl px-3 py-4"><div className="flex justify-end gap-1">
            <IconButton label={`Edit ${template.name}`} onClick={() => setEditing(template)}><Pencil size={15} /></IconButton>
            <IconButton label={`Delete ${template.name}`} className="text-rose-500" onClick={() => setDeleting(template)}><Trash2 size={15} /></IconButton>
          </div></td>
        </tr>)}</tbody>
      </DataTable>
    </GlassCard>}
    {editing && <NewTemplateDialog template={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    <ConfirmDialog
      open={Boolean(deleting)}
      title="Delete quotation template?"
      description={`“${deleting?.name}” and its quotation lines will be permanently deleted.`}
      confirmLabel="Delete template"
      danger
      busy={removeMutation.isPending}
      onCancel={() => setDeleting(null)}
      onConfirm={() => deleting && removeMutation.mutate(deleting.id)}
    />
  </>;
}
