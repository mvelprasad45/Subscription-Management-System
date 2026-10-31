import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Archive, ArrowDown, ArrowUp, ArrowUpDown, Copy, Package, Plus,
  Search, Trash2, Pencil, Layers3, CircleDollarSign, Activity, X,
} from "lucide-react";
import { toast } from "sonner";
import { productApi, errorMessage } from "../lib/api.js";
import {
  Button, ConfirmDialog, DataTable, Field, GlassCard, IconButton,
  PageHeading, Skeleton, StatCard, StatusBadge,
} from "../components/ui.jsx";

const typeNames = { SOFTWARE: "Software", ADD_ON: "Add-on", SERVICE: "Service", OTHER: "Other" };
const currency = (value) => `$${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [order, setOrder] = useState("desc");
  const [selected, setSelected] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const params = useMemo(() => ({
    page, limit: 8, search, type: type || undefined, status: status || undefined, sortBy, order,
  }), [page, search, type, status, sortBy, order]);
  const query = useQuery({
    queryKey: ["products", params],
    queryFn: () => productApi.list(params),
    placeholderData: (previous) => previous,
  });
  const products = query.data?.data?.products || [];
  const stats = query.data?.data?.stats;
  const meta = query.data?.meta;
  useEffect(() => {
    if (query.isError) toast.error(errorMessage(query.error));
  }, [query.isError, query.error]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["products"] });
  const bulkMutation = useMutation({
    mutationFn: ({ ids, action }) => productApi.bulk(ids, action),
    onSuccess: (result) => {
      toast.success(result.message);
      setSelected([]);
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const actionMutation = useMutation({
    mutationFn: async ({ action, product }) => {
      if (action === "duplicate") return productApi.duplicate(product.id);
      if (action === "delete") return productApi.remove(product.id);
      return productApi.status(product.id, "ARCHIVED");
    },
    onSuccess: (result) => {
      toast.success(result.message);
      refresh();
      setConfirm(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConfirm(null);
    },
  });

  function toggleSort(column) {
    if (sortBy === column) setOrder(order === "asc" ? "desc" : "asc");
    else { setSortBy(column); setOrder("asc"); }
  }
  function sortIcon(column) {
    if (sortBy !== column) return <ArrowUpDown size={13} className="opacity-40" />;
    return order === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />;
  }
  function ask(action, product) {
    if (action === "duplicate") {
      actionMutation.mutate({ action, product });
      return;
    }
    setConfirm({
      action: action === "delete" && product.activeSubscriptionCount > 0 ? "archiveInstead" : action,
      product,
    });
  }
  async function confirmAction() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.action === "bulkArchive") {
        await bulkMutation.mutateAsync({ ids: selected, action: "archive" });
        setConfirm(null);
      } else {
        await actionMutation.mutateAsync(confirm);
      }
    }
    catch { /* Mutation reports the request error. */ }
    finally { setBusy(false); }
  }
  const selectedAll = products.length > 0 && products.every((product) => selected.includes(product.id));

  return (
    <>
      <PageHeading
        eyebrow="Catalog management"
        title={<>Manage your <strong className="font-semibold">products</strong></>}
        description="Keep your product details, pricing, and plans beautifully organized."
        action={<Link to="/products/new" className="action-button inline-flex items-center gap-2 rounded-full bg-[#7c5cf0] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(124,92,240,.22)] hover:bg-[#6a4ae0]"><Plus size={17} /> New product</Link>}
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {query.isLoading && !query.data ? Array.from({ length: 4 }, (_, i) => <Skeleton className="h-[142px]" key={i} />) : <>
          <StatCard icon={Package} label="Total products" value={stats?.total ?? 0} detail="Products in your catalog" />
          <StatCard icon={Activity} label="Active" value={stats?.active ?? 0} detail="Currently available" tint="green" />
          <StatCard icon={Layers3} label="Inactive / archived" value={stats?.inactiveArchived ?? 0} detail="Not currently active" tint="amber" />
          <StatCard icon={CircleDollarSign} label="Average margin" value={currency(stats?.averageMargin)} detail="Sales price less cost price" />
        </>}
      </div>
      <GlassCard className="!p-4 sm:!p-6">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <label className="relative min-w-[210px] flex-1">
              <Search size={16} className="absolute left-3.5 top-3.5 text-[#9a94aa]" />
              <input aria-label="Search products" className="soft-input input-with-search" placeholder="Search products…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </label>
            <select aria-label="Filter by product type" className="soft-input sm:w-44" value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
              <option value="">All types</option>
              {Object.entries(typeNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Filter by status" className="soft-input sm:w-44" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
              <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option>
            </select>
          </div>
          <span className="text-xs text-[#8f899f]">{meta?.total ?? 0} products</span>
        </div>
        {selected.length > 0 && <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#dcd3ff] bg-[#ede7ff]/75 p-3">
          <span className="mr-1 text-sm font-semibold text-[#5b4b8c]">{selected.length} selected</span>
          <Button variant="secondary" className="!py-2 !text-xs" onClick={() => bulkMutation.mutate({ ids: selected, action: "activate" })}>Activate</Button>
          <Button variant="secondary" className="!py-2 !text-xs" onClick={() => bulkMutation.mutate({ ids: selected, action: "deactivate" })}>Deactivate</Button>
          <Button variant="secondary" className="!py-2 !text-xs" onClick={() => setConfirm({ action: "bulkArchive" })}>Archive</Button>
          <IconButton label="Clear selection" className="ml-auto" onClick={() => setSelected([])}><X size={15} /></IconButton>
        </div>}
        {query.isError && <div className="rounded-2xl bg-rose-50 p-5 text-sm text-rose-700"><p className="font-semibold">Products couldn’t be loaded.</p><p className="mt-1">{errorMessage(query.error)}</p><Button variant="secondary" className="mt-3" onClick={() => query.refetch()}>Try again</Button></div>}
        {!query.isError && query.isLoading && !query.data && <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>}
        {!query.isError && query.data && products.length === 0 && <div className="py-16 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#ede7ff] text-[#7c5cf0]"><Package size={23} /></div>
          <h2 className="mt-4 font-semibold text-[#403b54]">{search || type || status ? "No matching products" : "Your catalog is ready for its first product"}</h2>
          <p className="mt-1 text-sm text-[#938da2]">{search || type || status ? "Try adjusting your search or filters." : "Create a product to get started."}</p>
          {!search && !type && !status && <Link to="/products/new" className="action-button mt-4 inline-flex items-center gap-2 rounded-full bg-[#7c5cf0] px-4 py-2.5 text-sm font-semibold text-white"><Plus size={16} /> New product</Link>}
        </div>}
        {!query.isError && products.length > 0 && <DataTable>
          <thead><tr className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#9993a8]">
            <th className="w-10 px-3 pb-1"><input aria-label="Select all products" type="checkbox" checked={selectedAll} onChange={(event) => setSelected(event.target.checked ? [...new Set([...selected, ...products.map((p) => p.id)])] : selected.filter((id) => !products.some((p) => p.id === id)))} /></th>
            {[["name", "Name"], ["type", "Type"], ["salesPrice", "Sales price"], ["costPrice", "Cost price"]].map(([key, label]) =>
              <th key={key} className="px-3 pb-1"><button onClick={() => toggleSort(key)} className="inline-flex items-center gap-1.5 hover:text-[#6a4ae0]">{label}{sortIcon(key)}</button></th>)}
            <th className="px-3 pb-1"><button onClick={() => toggleSort("margin")} className="inline-flex items-center gap-1.5 hover:text-[#6a4ae0]">Margin{sortIcon("margin")}</button></th>
            <th className="px-3 pb-1"><button onClick={() => toggleSort("variantCount")} className="inline-flex items-center gap-1.5 hover:text-[#6a4ae0]">Variants{sortIcon("variantCount")}</button></th>
            <th className="px-3 pb-1"><button onClick={() => toggleSort("status")} className="inline-flex items-center gap-1.5 hover:text-[#6a4ae0]">Status{sortIcon("status")}</button></th><th className="px-3 pb-1 text-right">Actions</th>
          </tr></thead>
          <tbody>{products.map((product) => {
            const margin = Number(product.salesPrice) - Number(product.costPrice);
            return <tr key={product.id} className="group bg-white/70 text-sm transition hover:bg-white">
              <td className="rounded-l-2xl px-3 py-3.5"><input aria-label={`Select ${product.name}`} type="checkbox" checked={selected.includes(product.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))} /></td>
              <td className="px-3 py-3.5"><Link to={`/products/${product.id}/edit`} className="font-semibold text-[#433b5f] hover:text-[#7657e8]">{product.name}</Link><p className="mt-0.5 max-w-48 truncate text-[11px] text-[#a19bad]">{product.notes || "No description"}</p></td>
              <td className="px-3 py-3.5 text-[#706b80]">{typeNames[product.type]}</td>
              <td className="px-3 py-3.5 font-medium text-[#514a66]">{currency(product.salesPrice)}</td>
              <td className="px-3 py-3.5 text-[#706b80]">{currency(product.costPrice)}</td>
              <td className={`px-3 py-3.5 font-semibold ${margin < 0 ? "text-amber-700" : "text-emerald-700"}`}>{currency(margin)}<p className="text-[10px] font-normal opacity-70">{Number(product.salesPrice) > 0 ? `${((margin / Number(product.salesPrice)) * 100).toFixed(1)}%` : "—"}</p></td>
              <td className="px-3 py-3.5 text-[#706b80]">{product.variantCount}</td>
              <td className="px-3 py-3.5"><StatusBadge status={product.status} /></td>
              <td className="rounded-r-2xl px-3 py-3.5"><div className="flex justify-end gap-1">
                <Link to={`/products/${product.id}/edit`} aria-label="Edit product" title="Edit product" className="action-button grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white/70 text-[#69647d] hover:bg-white"><Pencil size={15} /></Link>
                <IconButton label="Duplicate product" onClick={() => ask("duplicate", product)}><Copy size={15} /></IconButton>
                {product.status !== "ARCHIVED" && <IconButton label="Archive product" onClick={() => ask("archive", product)}><Archive size={15} /></IconButton>}
                <IconButton label="Delete product" className="text-rose-500 hover:bg-rose-50" onClick={() => ask("delete", product)}><Trash2 size={15} /></IconButton>
              </div></td>
            </tr>;
          })}</tbody>
        </DataTable>}
        {meta && meta.totalPages > 1 && <div className="mt-4 flex items-center justify-between border-t border-white/60 pt-4">
          <p className="text-xs text-[#918ba1]">Page {meta.page} of {meta.totalPages}</p>
          <div className="flex gap-2"><Button variant="secondary" className="!px-4 !py-2" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button variant="secondary" className="!px-4 !py-2" disabled={page >= meta.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button></div>
        </div>}
      </GlassCard>
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.action === "bulkArchive" ? "Archive selected products?" : confirm?.action === "delete" ? "Delete this product?" : confirm?.action === "archiveInstead" ? "Product is in use" : "Archive this product?"}
        description={confirm?.action === "bulkArchive"
          ? `Archive ${selected.length} selected product(s)? Any existing subscriptions will remain unchanged.`
          : confirm?.action === "delete"
          ? `${confirm.product?.name} will be permanently deleted if it has no subscription or quotation-template references. Otherwise, archive it instead.`
          : confirm?.action === "archiveInstead"
            ? `${confirm.product?.name} is used by ${confirm.product.activeSubscriptionCount} active subscription(s) and cannot be deleted. Archive it instead? Existing subscriptions will remain unchanged.`
          : `${confirm?.product?.name} will be archived and hidden from active product lists. ${confirm?.product?.activeSubscriptionCount ? `It is used by ${confirm.product.activeSubscriptionCount} active subscription(s); existing subscriptions will remain unchanged.` : "You can reactivate it later."}`}
        confirmLabel={confirm?.action === "delete" ? "Delete product" : confirm?.action === "bulkArchive" ? "Archive selected" : confirm?.action === "archiveInstead" ? "Archive product" : "Archive product"}
        danger={confirm?.action === "delete"}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={confirmAction}
      />
    </>
  );
}
