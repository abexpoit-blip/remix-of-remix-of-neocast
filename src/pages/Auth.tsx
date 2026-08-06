import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { authApi, setToken, ApiError } from "@/lib/api";
import { toast } from "sonner";
import { RefreshCw, X, Loader2, User as UserIcon, Lock, ShieldCheck } from "lucide-react";
import { listAnnouncements, type Announcement } from "@/lib/store";
import { AuthNoticeBoard } from "@/components/shop/AuthNoticeBoard";


import { getSavedAccounts, removeSavedAccount, type SavedAccount } from "@/lib/accountSwitcher";
import { ForgotPasswordDialog } from "@/components/ForgotPasswordDialog";
import Seo from "@/components/Seo";
import { useAuth } from "@/hooks/useAuth";
import { ScorpionAuthShell } from "@/components/ScorpionAuthShell";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { telegramUrl, telegramLabel } from "@/lib/telegram";

/** Simple human check: only + and - with a non-negative answer. */
function makeChallenge() {
  const ai = Math.floor(Math.random() * 9) + 1;
  const bi = Math.floor(Math.random() * 9) + 1;
  const op = Math.random() < 0.5 ? "+" : "-";
  const [x, y] = op === "-" && bi > ai ? [bi, ai] : [ai, bi];
  return { a: x, b: y, op, expected: op === "+" ? x + y : x - y };
}



const Auth = () => {
  const site = useSiteSettings();
  const nav = useNavigate();
  const loc = useLocation();
  const { refresh } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captcha, setCaptcha] = useState("");

  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{ title: string; hint?: string } | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const fromPath = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const safeFrom = fromPath && fromPath !== "/auth" ? fromPath : null;

  const [challenge, setChallenge] = useState(() => makeChallenge());
  const { a, b, op, expected } = challenge;
  const captchaOk = captcha.trim() !== "" && Number(captcha) === expected;

  const [notices, setNotices] = useState<Announcement[]>([]);

  useEffect(() => {
    listAnnouncements()
      .then((rows) => setNotices(rows.slice(0, 5)))
      .catch(() => setNotices([]));
  }, []);

  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
    const prefill = sessionStorage.getItem("cruzercc.prefillEmail");
    if (prefill) {
      setUsername(prefill);
      sessionStorage.removeItem("cruzercc.prefillEmail");
    }
  }, []);


  const pickAccount = (acc: SavedAccount) => {
    setUsername(acc.email);
    setMode("login");
    setTimeout(() => document.getElementById("auth-password")?.focus(), 50);
  };

  const removeAccount = (e: React.MouseEvent, mail: string) => {
    e.stopPropagation();
    removeSavedAccount(mail);
    setSavedAccounts(getSavedAccounts());
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusBanner(null);
    if (!captchaOk) {
      setStatusBanner({ title: "Invalid verification code", hint: "Enter the answer shown on the button." });
      return toast.error("Invalid verification code");
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        const fakeEmail = email || `${username.toLowerCase()}@neocast.cc`;
        const result = await authApi.signup({ email: fakeEmail, username, password });
        setToken(result.token);
        await refresh();
        toast.success("Account created");
        nav("/shop", { replace: true });
      } else {
        const result = await authApi.login({ identifier: username.trim(), password });
        setToken(result.token);
        await refresh();
        const destination = safeFrom ?? (result.user.role === "admin" ? "/admin" : "/shop");

        toast.success("Welcome back");
        nav(destination, { replace: true });
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 403 && err.message === "Use admin login") {
          sessionStorage.setItem("cruzercc.prefillAdminEmail", username.trim());
          toast.error("Administrators only. Redirecting…");
          nav("/crzr-x9k2-panel", { replace: true });
          return;
        }
        setStatusBanner({ title: err.message, hint: `HTTP ${err.status}` });
        toast.error(err.message);
      } else {
        const msg = err instanceof Error ? err.message : "Sign-in error";
        setStatusBanner({ title: msg });
        toast.error(msg);
      }
    } finally { setLoading(false); }
  };

  return (
    <>
      <Seo title="Sign in | NeoCast" description="Sign in or create your NeoCast account — a verified marketplace with instant delivery." path="/auth" />
      <ScorpionAuthShell
        tagline={
          <>
            Sign in to buy verified cards with instant delivery.
          </>
        }

      >

        {/* Single mode header — signup is reachable via the link below */}
        <div className="mb-6 text-center">
          <div className="text-[12px] font-semibold tracking-[0.2em] uppercase text-[var(--nc-accent-soft)]">
            {mode === "login" ? "Sign in" : "Create account"}
          </div>
        </div>

        <AuthNoticeBoard notices={notices} />




        {savedAccounts.length > 0 && mode === "login" && (
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--nc-accent-soft)]/80 font-semibold mb-2">
              Switch account
            </div>
            <div className="space-y-1.5">
              {savedAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => pickAccount(acc)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 hover:border-[var(--nc-accent-soft)]/50 hover:bg-white/[0.07] transition-all group text-left"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[var(--nc-accent)] to-[var(--nc-accent-soft)] text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-[0_2px_10px_rgba(var(--nc-accent-rgb),0.35)]">
                    {acc.username[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{acc.username}</div>
                    <div className="text-[11px] text-white/50 truncate">{acc.role} · {acc.email}</div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => removeAccount(e, acc.email)}
                    onKeyDown={(e) => { if (e.key === "Enter") removeAccount(e as unknown as React.MouseEvent, acc.email); }}
                    className="opacity-0 group-hover:opacity-100 text-white/60 hover:text-white p-1 transition"
                    aria-label="Remove saved account"
                  >
                    <X className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {statusBanner && (
          <div className="mb-5 rounded-lg border border-red-400/40 bg-red-500/10 backdrop-blur-sm px-3 py-2.5 text-xs text-red-200" role="alert">
            <div className="font-semibold">{statusBanner.title}</div>
            {statusBanner.hint && <div className="opacity-80 mt-0.5">{statusBanner.hint}</div>}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="relative group">
            <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[var(--nc-accent-soft)] transition-colors" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder={mode === "login" ? "Username or email" : "Username"}
              className="w-full pl-11 pr-3 py-3 rounded-lg bg-white/[0.04] border border-white/10 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[var(--nc-accent-soft)]/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(var(--nc-accent-rgb),0.12)] transition-all backdrop-blur-sm"
            />
          </div>

          {mode === "signup" && (
            <div className="relative group">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[var(--nc-accent-soft)] transition-colors" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-full pl-11 pr-3 py-3 rounded-lg bg-white/[0.04] border border-white/10 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[var(--nc-accent-soft)]/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(var(--nc-accent-rgb),0.12)] transition-all backdrop-blur-sm"
              />
            </div>
          )}

          <div className="relative group">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[var(--nc-accent-soft)] transition-colors" />
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Password"
              className="w-full pl-11 pr-3 py-3 rounded-lg bg-white/[0.04] border border-white/10 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[var(--nc-accent-soft)]/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(var(--nc-accent-rgb),0.12)] transition-all backdrop-blur-sm"
            />
          </div>

          <div className="flex gap-2 items-stretch">
            <div className="relative flex-1 group">
              <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 group-focus-within:text-[var(--nc-accent-soft)] transition-colors" />
              <input
                type="text"
                inputMode="numeric"
                value={captcha}
                onChange={(e) => setCaptcha(e.target.value)}
                placeholder="Code"
                className="w-full pl-11 pr-3 py-3 rounded-lg bg-white/[0.04] border border-white/10 text-white text-sm placeholder-white/35 focus:outline-none focus:border-[var(--nc-accent-soft)]/60 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(var(--nc-accent-rgb),0.12)] transition-all backdrop-blur-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => { setCaptcha(""); setChallenge(makeChallenge()); }}
              className="min-w-[115px] px-3 rounded-lg bg-gradient-to-br from-[var(--nc-ink-2)]/70 to-[var(--nc-ink)]/70 border border-[var(--nc-accent-soft)]/30 flex items-center justify-center gap-2 hover:border-[var(--nc-accent-soft)]/60 hover:shadow-[0_0_16px_rgba(var(--nc-accent-rgb),0.22)] transition-all backdrop-blur-sm"
              aria-label="Refresh code"
            >
              <span
                className="text-base font-bold tracking-wider text-[var(--nc-accent-pale)] select-none"
                style={{ fontFamily: '"Space Grotesk", serif', fontStyle: "italic" }}
              >
                {a}{op}{b}=?
              </span>
              <RefreshCw className="h-3 w-3 text-white/60" />
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <label className="flex items-center gap-2 text-[12px] text-white/70 cursor-pointer select-none hover:text-white/90 transition">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--nc-accent-soft)]"
              />
              Remember me
            </label>
            {mode === "login" && (
              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="text-[12px] text-white/70 hover:text-[var(--nc-accent-soft)] transition"
              >
                Forgot password?
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="relative w-full py-3.5 mt-3 rounded-lg text-white text-sm font-bold tracking-[0.2em] uppercase transition-all disabled:opacity-60 flex items-center justify-center gap-2 overflow-hidden group shadow-[0_12px_34px_-8px_rgba(var(--nc-accent-rgb),0.55)] hover:shadow-[0_16px_44px_-8px_rgba(var(--nc-accent-rgb),0.7)] active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, var(--nc-accent) 0%, var(--nc-accent-lo) 55%, var(--nc-accent-soft) 100%)",
            }}
          >
            <span
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                background: "linear-gradient(135deg, var(--nc-accent-soft) 0%, var(--nc-accent-lo) 55%, var(--nc-accent) 100%)",
              }}
            />
            <span className="relative flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </span>
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-white/10 text-center">
          <button
            type="button"
            onClick={() => setMode(mode === "login" ? "signup" : "login")}
            className="text-[12px] text-white/60 hover:text-[var(--nc-accent-soft)] transition tracking-wide"
          >
            {mode === "login" ? (
              <>No account? <span className="text-[var(--nc-accent-soft)] font-semibold">Create one</span></>
            ) : (
              <>Already have an account? <span className="text-[var(--nc-accent-soft)] font-semibold">Sign in</span></>
            )}
          </button>
          {site.support_telegram || site.support_telegram_channel ? (
            <p className="mt-3 text-[11px] text-white/40">
              Need help?{" "}
              {site.support_telegram ? (
                <a href={telegramUrl(site.support_telegram)} target="_blank" rel="noreferrer" className="text-[var(--nc-accent-soft)] hover:underline font-mono">
                  {telegramLabel(site.support_telegram)}
                </a>
              ) : null}
              {site.support_telegram && site.support_telegram_channel ? " · " : ""}
              {site.support_telegram_channel ? (
                <a href={telegramUrl(site.support_telegram_channel)} target="_blank" rel="noreferrer" className="text-[var(--nc-accent-soft)] hover:underline font-mono">
                  {telegramLabel(site.support_telegram_channel)}
                </a>
              ) : null}
            </p>
          ) : null}
        </div>
      </ScorpionAuthShell>

      <ForgotPasswordDialog
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        defaultEmail={username.includes("@") ? username : ""}
        redirectPath="/reset-password"
      />
    </>
  );
};

export default Auth;
