import { X } from "lucide-react";

export function Button({ variant = "primary", className = "", children, ...props }) {
  const styles = variant === "primary"
    ? "bg-[#7c5cf0] text-white shadow-[0_8px_18px_rgba(124,92,240,.22)] hover:bg-[#6a4ae0]"
    : variant === "danger"
      ? "bg-rose-50 text-rose-600 hover:bg-rose-100"
      : "border border-white/80 bg-white/70 text-[#55506c] hover:bg-white";
  return (
    <button className={`action-button inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function IconButton({ label, className = "", children, ...props }) {
  return (
    <button aria-label={label} title={label} className={`action-button grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-white/70 text-[#69647d] hover:bg-white ${className}`} {...props}>
      {children}
    </button>
  );
}

export function GlassCard({ className = "", children }) {
  return <section className={`glass-card rounded-2xl p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function StatCard({ icon: Icon, label, value, detail, tint = "purple" }) {
  const palette = tint === "green"
    ? "bg-emerald-100 text-emerald-600"
    : tint === "amber"
      ? "bg-amber-100 text-amber-600"
      : "bg-[#ede7ff] text-[#7c5cf0]";
  return (
    <GlassCard className="min-h-[142px] transition duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[.13em] text-[#918ba6]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-[#2c2840]">{value}</p>
          <p className="mt-1 text-xs text-[#8a849e]">{detail}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-full ${palette}`}><Icon size={18} /></div>
      </div>
    </GlassCard>
  );
}

export function StatusBadge({ status }) {
  const variants = {
    ACTIVE: "bg-emerald-100/80 text-emerald-700",
    INACTIVE: "bg-slate-100 text-slate-600",
    ARCHIVED: "bg-amber-100/80 text-amber-700",
  };
  const label = { ACTIVE: "Active", INACTIVE: "Inactive", ARCHIVED: "Archived" }[status] || status;
  return <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${variants[status] || "bg-slate-100 text-slate-600"}`}>{label}</span>;
}

export function Field({ label, error, hint, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-semibold text-[#625d76]">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-rose-600">{error}</span>}
      {hint && !error && <span className="mt-1 block text-xs text-[#928ca4]">{hint}</span>}
    </label>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", danger = false, onCancel, onConfirm, busy = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#292342]/35 p-4 backdrop-blur-sm" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="glass-card w-full max-w-md rounded-3xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="confirm-title" className="text-lg font-semibold text-[#2c2840]">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-[#77718a]">{description}</p>
          </div>
          <IconButton label="Close" onClick={onCancel}><X size={16} /></IconButton>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DataTable({ children, className = "" }) {
  return <div className={`overflow-x-auto scrollbar-hide ${className}`}><table className="w-full min-w-[780px] border-separate border-spacing-y-2 text-left">{children}</table></div>;
}

export function TabForm({ tabs, activeTab, onChange }) {
  return <div className="mb-6 flex gap-1 overflow-x-auto rounded-full bg-[#e7e2f4]/75 p-1">
    {tabs.map(({ id, label, count }) => <button
      key={id}
      type="button"
      onClick={() => onChange(id)}
      className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-semibold transition ${activeTab === id ? "bg-white text-[#6148bb] shadow-sm" : "text-[#89839b] hover:text-[#5d5576]"}`}
    >{label}{count !== undefined ? ` · ${count}` : ""}</button>)}
  </div>;
}

export function Skeleton({ className = "" }) {
  return <div className={`animate-pulse rounded-xl bg-white/70 ${className}`} />;
}

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[.15em] text-[#8a7ebc]">{eyebrow}</p>}
        <h1 className="text-3xl font-light tracking-tight text-[#343047] sm:text-[38px]">{title}</h1>
        {description && <p className="mt-2 text-sm text-[#837d95]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
