import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";
import { ArrowRight, LockKeyhole, Mail, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../lib/auth.jsx";
import { errorMessage } from "../lib/api.js";
import { Button, Field } from "../components/ui.jsx";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: auth.login,
    onSuccess: () => {
      toast.success("Welcome back to Brightloop.");
      navigate("/products", { replace: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  if (auth.checking) return <main className="min-h-screen bg-[#c9c3ea] p-5"><div className="app-shell mx-auto h-[70vh] max-w-5xl animate-pulse rounded-[32px]" /></main>;
  if (auth.authenticated) return <Navigate to="/products" replace />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#c9c3ea] p-4">
      <div className="app-shell grid w-full max-w-5xl overflow-hidden rounded-[32px] p-3 sm:grid-cols-[1fr_.92fr] sm:p-4">
        <section className="relative hidden min-h-[620px] flex-col justify-between overflow-hidden rounded-[26px] bg-gradient-to-br from-[#7c5cf0] via-[#8f75ed] to-[#b4a1f3] p-10 text-white sm:flex">
          <div className="absolute -right-20 top-24 h-72 w-72 rounded-full border border-white/20" />
          <div className="absolute -right-5 top-40 h-52 w-52 rounded-full border border-white/20" />
          <div className="relative flex items-center gap-2 text-lg font-bold"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/20"><Sparkles size={18} /></span>Brightloop</div>
          <div className="relative max-w-sm">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[.18em] text-white/65">Admin workspace</p>
            <h1 className="text-4xl font-light leading-tight">A clearer way to manage your <span className="font-semibold">products.</span></h1>
            <p className="mt-4 text-sm leading-6 text-white/75">Your plans, pricing, and product catalog — thoughtfully together.</p>
          </div>
          <p className="relative text-xs text-white/60">Brightloop · Subscription management</p>
        </section>
        <section className="flex min-h-[560px] flex-col justify-center px-5 py-10 sm:px-12">
          <div className="mb-8 sm:hidden"><div className="mb-6 grid h-11 w-11 place-items-center rounded-2xl bg-[#7c5cf0] text-white"><Sparkles size={19} /></div><p className="text-lg font-bold">Brightloop</p></div>
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[.15em] text-[#8d80bc]">Welcome back</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#322d47]">Admin sign in</h2>
            <p className="mt-2 text-sm text-[#8a849b]">Sign in to manage your product catalog.</p>
          </div>
          <form className="space-y-5" onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate({ email, password });
          }}>
            <Field label="Email address">
              <div className="relative"><Mail className="absolute left-3.5 top-3.5 text-[#a19bb0]" size={17} /><input className="soft-input input-with-icon" type="email" autoComplete="username" required placeholder="admin@brightloop.com" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            </Field>
            <Field label="Password">
              <div className="relative"><LockKeyhole className="absolute left-3.5 top-3.5 text-[#a19bb0]" size={17} /><input className="soft-input input-with-icon" type="password" autoComplete="current-password" required placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            </Field>
            <Button className="mt-2 w-full !py-3" type="submit" disabled={mutation.isPending}>{mutation.isPending ? "Signing in…" : <>Continue <ArrowRight size={16} /></>}</Button>
          </form>
          <p className="mt-6 text-center text-xs text-[#aaa4b5]">Admin access only · No account registration</p>
        </section>
      </div>
    </main>
  );
}
