import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Bell, ChevronDown, CircleUserRound, LayoutDashboard, LogOut, Moon, Package,
  Sun,
  Settings2, Sparkles, Files,
} from "lucide-react";
import { useAuth, useLogout } from "../lib/auth.jsx";
import { useTheme } from "../lib/theme.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  { to: "/templates", label: "Templates", icon: Files },
];

export function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = useLogout();
  const { admin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  return (
    <main className="min-h-screen bg-[#c9c3ea] p-3 sm:p-5 lg:p-8">
      <div className="app-shell mx-auto min-h-[calc(100vh-24px)] max-w-[1500px] rounded-[26px] p-4 sm:min-h-[calc(100vh-40px)] sm:rounded-[32px] sm:p-7 lg:p-9">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-full border border-white/80 bg-white/65 px-3 py-2 shadow-[0_8px_26px_rgba(75,61,132,.07)] backdrop-blur-xl sm:px-5">
          <NavLink to="/products" className="flex items-center gap-2 px-2 text-lg font-bold tracking-tight text-[#30294a]">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#7c5cf0] text-white"><Sparkles size={17} /></span>
            Brightloop
          </NavLink>
          <nav className="order-3 flex w-full items-center justify-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${isActive ? "bg-white text-[#493a77] shadow-[0_4px_14px_rgba(56,44,94,.1)]" : "text-[#89839a] hover:bg-white/50 hover:text-[#5d5576]"}`}>
                <Icon size={15} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <button aria-label="Settings" className="grid h-9 w-9 place-items-center rounded-full text-[#827c94] hover:bg-white/75"><Settings2 size={17} /></button>
            <button aria-label="Notifications" className="relative grid h-9 w-9 place-items-center rounded-full text-[#827c94] hover:bg-white/75"><Bell size={17} /><span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#7c5cf0]" /></button>
            <button type="button" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={toggleTheme} className="grid h-9 w-9 place-items-center rounded-full text-[#827c94] transition hover:bg-white/75">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="relative">
              <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 rounded-full bg-white/75 py-1 pl-1 pr-2.5 text-sm font-semibold text-[#514a66] hover:bg-white">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ded6ff] text-xs font-bold text-[#7051db]">{admin?.name?.slice(0, 1) || "A"}</span>
                <span className="hidden max-w-24 truncate sm:inline">{admin?.name || "Admin"}</span><ChevronDown size={14} />
              </button>
              {menuOpen && <div className="absolute right-0 z-30 mt-2 w-52 rounded-2xl border border-white/80 bg-white p-2 shadow-xl">
                <div className="flex items-center gap-2 border-b border-[#f0edf8] px-3 py-2.5 text-xs text-[#827c94]"><CircleUserRound size={15} />{admin?.email}</div>
                <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50"><LogOut size={15} />Log out</button>
              </div>}
            </div>
          </div>
        </header>
        <div className="mx-auto max-w-[1320px] pb-10"><Outlet /></div>
      </div>
    </main>
  );
}
