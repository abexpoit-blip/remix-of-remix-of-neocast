import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { authApi, setToken, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { ShieldAlert, Lock, KeyRound, Loader2, ArrowLeft, ArrowRight, AlertCircle, WifiOff } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ScorpionAuthShell } from "@/components/ScorpionAuthShell";

const AUTH_BACKEND = "NeoCast authentication service";

const AdminLogin = () => {
  const nav = useNavigate();
  const loc = useLocation();
  const { profile, user, loading: authLoading, refresh } = useAuth();
  const fromPath = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const safeAdminFrom = fromPath && fromPath.startsWith("/admin") && fromPath !== "/crzr-x9k2-panel" ? fromPath : null;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ title: string; detail?: string } | null>(null);

  useEffect(() => {
    if (!authLoading && user && (profile?.role === "admin" || profile?.role === "superadmin")) {
      nav(safeAdminFrom ?? "/admin", { replace: true });
    }
  }, [authLoading, user, profile, nav, safeAdminFrom]);

  useEffect(() => { document.title = "NeoCast · Admin console"; }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("cruzercc.prefillAdminEmail");
    if (saved) { setEmail(saved); sessionStorage.removeItem("cruzercc.prefillAdminEmail"); }
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await authApi.adminLogin({ identifier: email.trim().toLowerCase(), password });
       if (result.user.role !== "admin" && result.user.role !== "superadmin") {
         throw new Error("This account has no administrator rights.");
       }
      setToken(result.token);
      await refresh();
      toast.success("Admin console unlocked");
      nav(safeAdminFrom ?? "/admin", { replace: true });
    } catch (err) {
      let title = "Sign-in error"; let detail: string | undefined;
      if (err instanceof ApiError) {
         if (err.status === 0) { title = "Server unavailable"; detail = `${AUTH_BACKEND} is unavailable.`; }
        else if (err.status === 401) { title = "Invalid credentials"; detail = "Check your email and password."; }
        else if (err.status === 403) { title = "Not an admin account"; detail = "This login is for administrators only."; }
        else if (err.contentType?.includes("text/html")) { title = "Server configuration error"; detail = `API returned HTML (HTTP ${err.status}).`; }
        else title = err.message;
      } else if (err instanceof Error) title = err.message;
      setError({ title, detail });
      toast.error(title);
    } finally { setLoading(false); }
  };

  return (
    <ScorpionAuthShell
      title="Admin console"
      accent="red"
      tagline={
        <span className="inline-flex items-center gap-2 text-white/85">
          <ShieldAlert className="h-4 w-4 text-red-400" />
          Restricted access · Staff only
        </span>
      }
    >
      <Link to="/auth" className="inline-flex items-center gap-1.5 text-[11px] text-white/60 hover:text-[#4fc3f7] mb-4 transition">
        <ArrowLeft className="h-3 w-3" /> Back to user login
      </Link>

      {safeAdminFrom && (
        <div className="mb-4 rounded-sm border border-[#2196f3]/40 bg-[#2196f3]/10 px-3 py-2 text-xs text-[#81d4fa] flex items-start gap-2">
          <ArrowRight className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>After signing in you will be redirected to <span className="font-mono underline">{safeAdminFrom}</span></span>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-sm border border-red-400/50 bg-red-500/10 px-3 py-2.5 text-xs text-red-200" role="alert">
          <div className="flex items-center gap-2 font-semibold">
            {error.title.includes("unavailable") ? <WifiOff className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
            {error.title}
          </div>
          {error.detail && <p className="mt-1 opacity-80">{error.detail}</p>}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3">
        <div className="relative">
          <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username"
            placeholder="admin@example.com"
            className="w-full pl-10 pr-3 py-3 rounded-sm bg-white/5 border border-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:border-red-400 transition-colors" />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/50" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
            autoComplete="current-password" placeholder="password"
            className="w-full pl-10 pr-3 py-3 rounded-sm bg-white/5 border border-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:border-red-400 transition-colors" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full py-3 mt-3 rounded-sm bg-gradient-to-r from-red-600 to-red-700 text-white text-sm font-bold tracking-wide uppercase hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-[0_0_24px_rgba(239,68,68,0.35)]">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {loading ? "Checking…" : "Sign in to console"}
        </button>
      </form>

      <p className="text-center text-[10px] font-mono tracking-[0.3em] text-white/40 mt-6">
        UNAUTHORIZED ACCESS IS LOGGED · IP TRACKED
      </p>
    </ScorpionAuthShell>
  );
};

export default AdminLogin;
