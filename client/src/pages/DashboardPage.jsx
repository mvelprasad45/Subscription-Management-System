import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowUpRight, Boxes, CircleDollarSign, Package } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { GlassCard, PageHeading, Skeleton, StatCard } from "../components/ui.jsx";
import { productApi } from "../lib/api.js";
import { Link } from "react-router-dom";

export function DashboardPage() {
  const query = useQuery({ queryKey: ["products", { page: 1, limit: 1 }], queryFn: () => productApi.list({ page: 1, limit: 1 }) });
  const stats = query.data?.data?.stats;
  const chartData = stats?.weeklyAdds || [];
  return (
    <>
      <PageHeading eyebrow="Your workspace" title={<>Hello, Admin 👋 Manage your <strong className="font-semibold">products</strong></>} description="A quick snapshot of your Brightloop catalog." action={<Link to="/products" className="action-button inline-flex items-center gap-2 rounded-full bg-[#7c5cf0] px-5 py-3 text-sm font-semibold text-white">View products <ArrowUpRight size={16} /></Link>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {query.isLoading ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36" />) : <>
          <StatCard icon={Package} label="Total products" value={stats?.total ?? 0} detail="Across your catalog" />
          <StatCard icon={Activity} label="Active" value={stats?.active ?? 0} detail="Available to manage" tint="green" />
          <StatCard icon={Boxes} label="Inactive / archived" value={stats?.inactiveArchived ?? 0} detail="Not currently active" tint="amber" />
          <StatCard icon={CircleDollarSign} label="Average margin" value={`$${Number(stats?.averageMargin || 0).toFixed(2)}`} detail="Average per product" />
        </>}
      </div>
      <GlassCard className="mt-5">
        <div className="mb-4 flex items-start justify-between"><div><p className="font-semibold text-[#3a354e]">Products added this week</p><p className="mt-1 text-xs text-[#918ba2]">Your catalog activity at a glance</p></div><span className="rounded-full bg-[#ede7ff] px-3 py-1.5 text-xs font-semibold text-[#7859e7]">This week</span></div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ left: 0, right: 12, top: 10, bottom: 0 }}>
              <defs><linearGradient id="catalog-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#8b6ff0" stopOpacity={0.28} /><stop offset="100%" stopColor="#8b6ff0" stopOpacity={0.015} /></linearGradient></defs>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#9690a5", fontSize: 12 }} />
              <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #eee9fa", background: "#fff" }} />
              <Area type="monotone" dataKey="count" stroke="#7c5cf0" strokeWidth={3} fill="url(#catalog-fill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-[#9791a5]">Daily product creations over the last seven days.</p>
      </GlassCard>
    </>
  );
}
