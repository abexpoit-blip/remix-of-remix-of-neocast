import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { createCryptoInvoice, checkDepositStatus } from "@/lib/plisio.functions";
import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import {
  CheckCircle2, Copy, Clock, XCircle, Loader2,
  AlertCircle, ArrowDownLeft, ArrowUpRight, TimerReset, Receipt, ShieldCheck, Wallet, Gift,
} from "lucide-react";
import { toast } from "sonner";
import { redeemCode, translateRedeemError } from "@/lib/store";
import { QRCodeSVG } from "qrcode.react";
import { calculateDepositFee } from "@/lib/fees";
import { useServerFn } from "@tanstack/react-start";

interface Deposit { id: string; amount: number; method: string; txid: string | null; status: string; created_at: string; crypto_currency?: string; plisio_wallet?: string; confirmations?: number; }
interface Transaction { id: string; type: string; amount: number; note?: string; method?: string; ref_id?: string; meta?: string; created_at: string; }

const INVOICE_TTL_SEC = 30 * 60;
const STORAGE_KEY = "neocast.activeInvoice";

const formatCountdown = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const Recharge = () => {
  const { profile, refresh } = useAuth();
  const settings = useSiteSettings();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isActivation = searchParams.get("activate") === "1";
  const urlAmount = searchParams.get("amount");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Deposit[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [redeemInput, setRedeemInput] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const createCryptoInvoiceFn = useServerFn(createCryptoInvoice);
  const checkDepositStatusFn = useServerFn(checkDepositStatus);

  const [activeInvoice, setActiveInvoiceRaw] = useState<{
    deposit_id: string; wallet_address: string; crypto_amount: string;
    currency: string; qr_data: string; status: string; invoice_url?: string;
    confirmations: number; usd_amount: number; expires_ms: number;
    fee_amount?: number; charged_amount?: number;
    fee_mode?: "add" | "deduct"; fee_percent?: number;
  } | null>(() => {

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (!parsed?.expires_ms || Date.now() > parsed.expires_ms) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch { return null; }
  });

  const setActiveInvoice = useCallback((val: typeof activeInvoice | ((prev: typeof activeInvoice) => typeof activeInvoice)) => {
    setActiveInvoiceRaw((prev) => {
      const next = typeof val === "function" ? (val as (p: typeof activeInvoice) => typeof activeInvoice)(prev) : val;
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else localStorage.removeItem(STORAGE_KEY);
      return next;
    });
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [countdown, setCountdown] = useState<number>(-1);

  const loadHistory = async () => {
    try {
      const { data } = await supabase.from("deposits").select("*").order("created_at", { ascending: false }).limit(20);
      setHistory((data ?? []) as unknown as Deposit[]);
    } catch { /* ignore */ }
  };
  const loadTransactions = async () => {
    try {
      const { data } = await supabase.from("balance_transactions").select("*").order("created_at", { ascending: false }).limit(20);
      setTransactions(((data ?? []) as Array<{ id: string; kind: string; amount: number; description: string | null; created_at: string }>)
        .map((t) => ({ id: t.id, type: t.kind, amount: Number(t.amount), note: t.description ?? undefined, created_at: t.created_at })));
    } catch { /* ignore */ }
  };

  const startPolling = useCallback((depositId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const s = await checkDepositStatusFn({ data: { deposit_id: depositId } });
        setActiveInvoice(prev => prev ? {
          ...prev,
          status: s.status,
          confirmations: s.confirmations ?? 0,
          wallet_address: prev.wallet_address || (s as { wallet_address?: string }).wallet_address || "",
          qr_data: prev.qr_data || (s as { wallet_address?: string }).wallet_address || "",
          crypto_amount: prev.crypto_amount || (s as { crypto_amount?: string }).crypto_amount || "",
        } : prev);
        if (s.status === "approved") {
          toast.success(`$${s.amount} credited to your balance!`);
          setActiveInvoice(null);
          if (pollRef.current) clearInterval(pollRef.current);
          loadHistory(); loadTransactions();
          if (isActivation) setTimeout(() => navigate("/shop"), 1200);
        } else if (s.status === "rejected") {
          toast.error("Invoice cancelled or expired.");
          setActiveInvoice(null);
          if (pollRef.current) clearInterval(pollRef.current);
          loadHistory();
        }
      } catch { /* continue polling */ }
    }, 10_000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkDepositStatusFn, isActivation, navigate, setActiveInvoice]);

  useEffect(() => {
    loadHistory(); loadTransactions();
    const returned = searchParams.get("payment");
    if (activeInvoice?.deposit_id && activeInvoice.status === "pending") {
      // instant check when the user comes back from the payment page
      if (returned) {
        checkDepositStatusFn({ data: { deposit_id: activeInvoice.deposit_id } })
          .then((s) => {
            if (s.status === "approved") {
              toast.success(`$${s.amount} credited to your balance!`);
              setActiveInvoice(null);
              loadHistory(); loadTransactions();
            } else if (s.status === "rejected") {
              toast.error("Payment not completed or expired.");
              setActiveInvoice(null);
              loadHistory();
            }
          })
          .catch(() => { /* ignore */ });
      }
      startPolling(activeInvoice.deposit_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  useEffect(() => {
    if (amount) return;
    if (urlAmount && Number(urlAmount) > 0) setAmount(String(Number(urlAmount)));
    else if (isActivation) {
      const min = Number(settings.min_deposit ?? 20);
      if (min > 0) setAmount(String(min));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.min_deposit, urlAmount, isActivation]);

  // 30-minute countdown
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!activeInvoice?.expires_ms) { setCountdown(-1); return; }
    const calc = () => Math.max(0, Math.floor((activeInvoice.expires_ms - Date.now()) / 1000));
    setCountdown(calc());
    countdownRef.current = setInterval(() => {
      const remaining = calc();
      setCountdown(remaining);
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [activeInvoice?.expires_ms]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const isExpired = !!activeInvoice && countdown === 0;
  const MIN_DEPOSIT = Math.max(20, settings.min_deposit || 20);
  const amtNum = Number(amount) || 0;
  const feePreview = calculateDepositFee(
    amtNum,
    settings.deposit_fee_percent,
    settings.deposit_fee_flat,
    settings.deposit_fee_mode,
  );

  const createInvoice = async () => {
    if (!amtNum || amtNum < MIN_DEPOSIT) return toast.error(`Minimum deposit is $${MIN_DEPOSIT}.`);
    setBusy(true);
    try {
      const inv = await createCryptoInvoiceFn({ data: { amount: amtNum } });
      setActiveInvoice({
        deposit_id: inv.deposit_id,
        wallet_address: inv.wallet_address || "",
        crypto_amount: inv.crypto_amount,
        currency: "LTC",
        qr_data: inv.wallet_address || "",
        invoice_url: inv.invoice_url || "",
        status: "pending",
        confirmations: 0,
        usd_amount: inv.usd_amount ?? amtNum,
        fee_amount: inv.fee_amount,
        charged_amount: inv.charged_amount,
        fee_mode: inv.fee_mode,
        fee_percent: inv.fee_percent,
        expires_ms: inv.expires_ms || Date.now() + INVOICE_TTL_SEC * 1000,

      });
      startPolling(inv.deposit_id);
      toast.success("Invoice created — send LTC to the address below.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not create the invoice");
    } finally { setBusy(false); }
  };

  const copyField = async (txt: string, field: string) => {
    if (isExpired) return;
    try {
      await navigator.clipboard.writeText(txt);
      setCopiedField(field);
      toast.success("Copied");
      setTimeout(() => setCopiedField(null), 2000);
    } catch { toast.error("Copy failed — please copy manually"); }
  };

  const walletAddress = activeInvoice?.wallet_address || activeInvoice?.qr_data || "";
  const qrValue = walletAddress
    ? (activeInvoice?.crypto_amount
      ? `litecoin:${walletAddress}?amount=${activeInvoice.crypto_amount}`
      : `litecoin:${walletAddress}`)
    : "";

  const txnIcon = (type: string) => {
    if (type === "deposit") return <ArrowDownLeft className="h-4 w-4 text-[#2fb344]" />;
    if (type === "purchase") return <ArrowUpRight className="h-4 w-4 text-[#c0392b]" />;
    if (type === "refund") return <ArrowDownLeft className="h-4 w-4 text-[var(--nc-accent)]" />;
    return <Receipt className="h-4 w-4 text-[#888]" />;
  };

  const submitRedeem = async () => {
    const code = redeemInput.trim();
    if (!code) return toast.error("Enter a redeem code");
    setRedeemBusy(true);
    try {
      const credited = await redeemCode(code);
      toast.success(`$${credited.toFixed(2)} added to your balance`);
      setRedeemInput("");
      await refresh();
      void loadTransactions();
    } catch (e) {
      toast.error(translateRedeemError(e instanceof Error ? e.message : "Redeem failed"));
    } finally {
      setRedeemBusy(false);
    }
  };

  const cancelInvoice = () => {
    setActiveInvoice(null);
    setCountdown(-1);
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const progress = activeInvoice ? Math.max(0, Math.min(100, (countdown / INVOICE_TTL_SEC) * 100)) : 0;

  return (
    <AppShell>
      <div className="space-y-4 max-w-6xl">
        {/* PREMIUM HEADER */}
        <section className="rounded-xl overflow-hidden bg-[var(--nc-ink)] border border-[var(--nc-line)] relative">
          <div className="absolute -top-16 -right-10 h-52 w-52 rounded-full bg-[var(--nc-accent)]/25 blur-3xl" />
          <div className="relative px-5 sm:px-7 py-6 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--nc-accent-soft)] font-semibold">NeoCast Wallet</div>
              <h1 className="mt-1.5 text-white text-[22px] sm:text-[26px] font-bold tracking-tight">Deposit &amp; balance</h1>
              <p className="mt-1 text-[12.5px] text-white/50 max-w-md leading-relaxed">
                Instant crypto top-ups with automatic crediting after network confirmation.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-[#333] bg-[var(--nc-ink-2)] px-4 py-3 min-w-[150px]">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">Available balance</div>
                <div className="text-[22px] font-bold text-white tabular-nums">${Number(profile?.balance ?? 0).toFixed(2)}</div>
              </div>
              <div className="rounded-lg border border-[#333] bg-[var(--nc-ink-2)] px-4 py-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-white/40">Method</div>
                <div className="text-[14px] font-semibold text-[var(--nc-accent-soft)]">LTC</div>
              </div>
            </div>
          </div>
          <div className="h-[3px] bg-gradient-to-r from-[var(--nc-accent)] via-[var(--nc-accent-soft)] to-transparent" />
        </section>

        {isActivation && (
          <div className="bg-white border border-[#e6e6e6] px-4 py-3 flex items-start gap-3 text-[13px]">
            <div className="shrink-0 h-8 w-8 bg-[var(--nc-accent)] text-white flex items-center justify-center text-sm font-bold">$</div>
            <div>
              <div className="text-[12px] font-semibold text-[var(--nc-accent)] uppercase tracking-wider">Account activation</div>
              <div className="text-[#333] mt-0.5">
                Top up ${Number(settings.min_deposit ?? MIN_DEPOSIT).toFixed(2)} to unlock the shop.
              </div>
            </div>
          </div>
        )}

        {activeInvoice ? (
          // ---- ACTIVE INVOICE ----
          <section className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="px-4 h-11 flex items-center justify-between bg-[var(--nc-ink-2)] border-b-2 border-[var(--nc-accent)]">
              <span className="text-[13px] text-white/85 uppercase tracking-wider">Payment · Litecoin (LTC)</span>
              <span className="text-[11px] font-mono text-white/45">#{activeInvoice.deposit_id.slice(0, 8).toUpperCase()}</span>
            </div>

            {/* countdown bar */}
            <div className="px-4 pt-4">
              <div className={`flex items-center justify-between h-11 px-4 border text-[13px] ${
                isExpired ? "bg-[#fdecea] border-[#f5c6cb] text-[#c0392b]"
                  : countdown <= 300 ? "bg-[#fff8e1] border-[#ffe0a0] text-[#b26a00]"
                  : "bg-[#fdecea] border-[#f3c3c3] text-[var(--nc-accent)]"
              }`}>
                <span className="inline-flex items-center gap-2">
                  <TimerReset className="h-4 w-4" />
                  {isExpired ? "Time expired" : "Pay within"}
                </span>
                <span className="font-mono text-[18px] font-semibold tracking-widest">
                  {isExpired ? "00:00" : formatCountdown(countdown)}
                </span>
              </div>
              <div className="h-1 bg-[#f0f0f0] mt-[-1px]">
                <div
                  className={`h-1 transition-all duration-1000 ${isExpired ? "bg-[#c0392b]" : countdown <= 300 ? "bg-[#b26a00]" : "bg-[var(--nc-accent)]"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* QR */}
              <div className="space-y-3">
                <div className="text-center border border-[#e6e6e6] bg-[#fafafa] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-[#888]">Deposit amount</p>
                  <p className="text-[24px] font-semibold text-[var(--nc-accent)] font-mono">${activeInvoice.usd_amount.toFixed(2)}</p>
                  {activeInvoice.fee_amount ? (
                    <p className="text-[11px] text-[#888] font-mono">
                      pay ${activeInvoice.charged_amount?.toFixed(2)} · fee ${activeInvoice.fee_amount.toFixed(2)}
                    </p>
                  ) : null}

                </div>
                 {qrValue ? <div className={`flex justify-center ${isExpired ? "opacity-25 pointer-events-none" : ""}`}>
                  <div className="p-3 bg-white border border-[#e6e6e6]">
                    <QRCodeSVG value={qrValue} size={190} level="M" includeMargin={false} />
                  </div>
                 </div> : (
                  <div className="flex justify-center">
                    <div className="p-3 bg-white border border-[#e6e6e6] h-[214px] w-[214px] flex flex-col items-center justify-center gap-2 text-[11px] text-[#888]">
                      <Loader2 className="h-5 w-5 animate-spin text-[var(--nc-accent)]" />
                      Preparing your LTC address…
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-center text-[#888]">
                   {isExpired ? "This QR code is no longer valid" : walletAddress ? "Scan the QR in your LTC wallet" : "Address is being generated — keep this tab open"}
                </p>
              </div>

              {/* Details */}
              <div className="space-y-3">
                {activeInvoice.crypto_amount ? <div className={`border border-[#e6e6e6] bg-[#fafafa] p-3 ${isExpired ? "opacity-40" : ""}`}>
                  <p className="text-[10px] uppercase tracking-wider text-[#888]">Send exactly</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-mono text-[16px] font-semibold text-[#1f2d3d] flex-1 break-all">
                      {activeInvoice.crypto_amount} LTC
                    </span>
                    <button onClick={() => copyField(activeInvoice.crypto_amount, "amount")} disabled={isExpired}
                      className="shrink-0 h-8 w-8 border border-[#dcdcdc] bg-white hover:bg-[#fbf1f3] text-[var(--nc-accent)] flex items-center justify-center disabled:opacity-30">
                      {copiedField === "amount" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div> : null}

                <div className={`border border-[#e6e6e6] bg-[#fafafa] p-3 ${isExpired ? "opacity-40" : ""}`}>
                  <div className="flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5 text-[var(--nc-accent)]" />
                    <p className="text-[10px] uppercase tracking-wider text-[#888]">LTC wallet address</p>
                  </div>
                  {walletAddress ? (
                    <>
                      <div className="flex items-center gap-2 mt-2">
                        <code className="text-[12px] text-[#333] break-all flex-1 font-mono leading-relaxed">
                          {walletAddress}
                        </code>
                        <button onClick={() => copyField(walletAddress, "address")} disabled={isExpired}
                          className="shrink-0 h-8 w-8 border border-[#dcdcdc] bg-white hover:bg-[#fbf1f3] text-[var(--nc-accent)] flex items-center justify-center disabled:opacity-30">
                          {copiedField === "address" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <button onClick={() => copyField(walletAddress, "address")} disabled={isExpired}
                        className="mt-2 w-full h-9 bg-[var(--nc-accent)] hover:bg-[var(--nc-accent-hi)] text-white text-[12px] inline-flex items-center justify-center gap-2 disabled:opacity-40">
                        {copiedField === "address" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedField === "address" ? "Address copied" : "Copy wallet address"}
                      </button>
                    </>
                  ) : (
                    <p className="mt-2 text-[12px] text-[#888] inline-flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--nc-accent)]" />
                      Generating address…
                    </p>
                  )}
                </div>

                <div className="flex items-start gap-2 p-3 border border-[#ffe0a0] bg-[#fff8e1] text-[12px] text-[#b26a00]">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Send <strong>LTC only</strong> to this address. Other coins will be lost permanently.</p>
                </div>

                {!isExpired ? (
                  <div className="border border-[#e6e6e6] bg-white p-3 space-y-2 text-[12px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-[#333]">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--nc-accent)]" />
                        <span className="uppercase tracking-wider">Waiting for payment</span>
                      </div>
                      <span className="text-[11px] font-mono text-[var(--nc-accent)]">
                        {activeInvoice.confirmations ?? 0}/2 confirmations
                      </span>
                    </div>
                    <p className="text-[11px] text-center text-[#888] pt-1">
                      Status refreshes automatically every 10 seconds — keep this tab open.
                    </p>
                  </div>
                ) : (
                  <div className="border border-[#f5c6cb] bg-[#fdecea] p-3 text-[12px] text-[#c0392b]">
                    This invoice expired — payments to this address are no longer credited. Create a new invoice.
                  </div>
                )}

                <button onClick={cancelInvoice}
                  className={`w-full h-10 text-[13px] transition ${
                    isExpired ? "bg-[var(--nc-accent)] hover:bg-[var(--nc-accent-hi)] text-white"
                      : "border border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7]"
                  }`}>
                  {isExpired ? "Create new invoice" : "Cancel"}
                </button>
              </div>
            </div>
          </section>
        ) : (
          // ---- FORM ----
          <section className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="px-4 h-11 flex items-center bg-[var(--nc-ink-2)] text-[13px] text-white/85 uppercase tracking-wider border-b-2 border-[var(--nc-accent)]">
              Add funds
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <div className="border border-[#e6e6e6] bg-[#fafafa] p-4">
                  <div className="flex items-center gap-2 text-[13px] text-[#1f2d3d] font-semibold">
                    <Wallet className="h-4 w-4 text-[var(--nc-accent)]" /> Litecoin (LTC) only
                  </div>
                  <p className="text-[12px] text-[#666] mt-1.5 leading-[1.7]">
                    Fast confirmations and low network fees. Other coins are not accepted.
                  </p>
                </div>

                <ul className="text-[13px] text-[#333] leading-[1.9] list-disc pl-5">
                  <li>Minimum deposit is <strong>${MIN_DEPOSIT}</strong>.</li>
                  <li>The address and amount stay valid for <strong>30 minutes</strong>.</li>
                  <li>Send the exact amount — otherwise funds may not be credited.</li>
                  <li>Balance is credited automatically after 2 network confirmations.</li>
                </ul>

                <div className="flex items-start gap-2 p-3 border border-[#d7ecd9] bg-[#f2faf3] text-[12px] text-[#2e7d32]">
                  <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>Every invoice gets a unique address. Never reuse an old address.</p>
                </div>
              </div>

              <div className="md:border-l md:border-[#e6e6e6] md:pl-8">
                <label className="text-[12px] uppercase tracking-wider text-[#888]">Amount in USD</label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="h-11 w-11 border border-[#dcdcdc] bg-[#fafafa] flex items-center justify-center text-[#888] font-mono">$</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    type="number"
                    min={MIN_DEPOSIT}
                    placeholder={`Minimum ${MIN_DEPOSIT}`}
                    className="flex-1 h-11 px-3 border border-[#dcdcdc] text-[14px] font-mono outline-none focus:border-[var(--nc-accent)]"
                  />
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {[50, 100, 250, 500, 1000].map((v) => (
                    <button key={v} onClick={() => setAmount(String(v))}
                      className={`px-3 h-8 text-[12px] border transition ${
                        amount === String(v) ? "border-[var(--nc-accent)] text-[var(--nc-accent)] bg-[#fbf1f3]" : "border-[#dcdcdc] text-[#555] hover:bg-[#f7f7f7]"
                      }`}>
                      ${v}
                    </button>
                  ))}
                </div>

                <div className="text-[12px] text-[#666] mt-4 pt-4 border-t border-[#eee] space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span>Deposit fee ({feePreview.percent}%{feePreview.flat > 0 ? ` + $${feePreview.flat.toFixed(2)}` : ""})</span>
                    <span className="font-mono text-[#1f2d3d]">${feePreview.fee.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total to pay</span>
                    <span className="font-mono font-semibold text-[var(--nc-accent)]">${feePreview.charged.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-[#eee] pt-1.5 mt-1.5">
                    <span className="font-semibold text-[#1f2d3d]">Added to balance (after fee)</span>
                    <span className="font-mono font-semibold text-[#2e7d32]">+${feePreview.credit.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Balance after deposit</span>
                    <span className="font-mono font-semibold text-[#1f2d3d]">
                      ${(Number(profile?.balance ?? 0) + feePreview.credit).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Current balance</span>
                    <span className="font-mono font-semibold text-[#1f2d3d]">${Number(profile?.balance ?? 0).toFixed(2)}</span>
                  </div>
                </div>


                <button
                  onClick={createInvoice}
                  disabled={busy || amtNum < MIN_DEPOSIT}
                  className="w-full h-11 mt-4 bg-[var(--nc-accent)] hover:bg-[var(--nc-accent-hi)] disabled:opacity-50 text-white text-[13px] uppercase tracking-wider inline-flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                  Pay with LTC
                </button>
                <p className="text-[11px] text-[#888] mt-2 text-center">
                  A QR code and address appear next. Timer — 30 minutes.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Redeem code */}
        <section className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="px-4 h-11 flex items-center gap-2 bg-[var(--nc-ink-2)] text-[13px] text-white/85 uppercase tracking-wider border-b-2 border-[var(--nc-accent)]">
            <Gift className="h-4 w-4 text-[var(--nc-accent-soft)]" /> Redeem a code
          </div>
          <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
            <input
              value={redeemInput}
              onChange={(e) => setRedeemInput(e.target.value.toUpperCase())}
              placeholder="NEO-XXXX-XXXX-XXXX"
              className="flex-1 h-11 px-3 border border-[#dcdcdc] text-[14px] font-mono tracking-wider outline-none focus:border-[var(--nc-accent)]"
            />
            <button
              onClick={submitRedeem}
              disabled={redeemBusy || !redeemInput.trim()}
              className="h-11 px-6 bg-[var(--nc-accent)] hover:bg-[var(--nc-accent-hi)] disabled:opacity-50 text-white text-[13px] uppercase tracking-wider inline-flex items-center justify-center gap-2"
            >
              {redeemBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              Redeem
            </button>
          </div>
          <p className="px-4 pb-4 text-[11px] text-[#888]">
            Codes are published on our Telegram channel. Each code works only once and credits your balance instantly.
          </p>
        </section>


        {/* Transactions */}
        {transactions.length > 0 && (
          <section className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="px-4 h-10 flex items-center bg-[var(--nc-ink-2)] text-[13px] text-white/85 uppercase tracking-wider border-b-2 border-[var(--nc-accent)]">
              <Receipt className="h-4 w-4 mr-2 text-[var(--nc-accent)]" /> Transaction history
            </div>
            <div className="p-3">
              <div className="divide-y divide-[#eee]">
                {transactions.slice(0, 20).map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-2 py-2 text-[13px]">
                    <div className="flex items-center gap-3">
                      {txnIcon(t.type)}
                      <div>
                        <p className="capitalize text-[#333]">{t.type}</p>
                        <p className="text-[11px] text-[#888]">
                          {new Date(t.created_at).toLocaleDateString()} {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <span className={`font-mono font-semibold ${Number(t.amount) >= 0 ? "text-[#2fb344]" : "text-[#c0392b]"}`}>
                      {Number(t.amount) >= 0 ? "+" : ""}${Math.abs(Number(t.amount)).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Deposits */}
        {history.length > 0 && (
          <section className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="px-4 h-10 flex items-center bg-[var(--nc-ink-2)] text-[13px] text-white/85 uppercase tracking-wider border-b-2 border-[var(--nc-accent)]">
              Recent deposits
            </div>
            <div className="p-3">
              <div className="divide-y divide-[#eee]">
                {history.map((d) => {
                  const expired = d.status === "pending" && (Date.now() - new Date(d.created_at).getTime() > INVOICE_TTL_SEC * 1000);
                  const st = expired ? "expired" : d.status;
                  return (
                    <div key={d.id} className="flex items-center justify-between px-2 py-2 text-[13px]">
                      <div>
                        <p className="text-[#333]">
                          <span className="font-mono font-semibold">${Number(d.amount).toFixed(2)}</span>
                          <span className="text-[11px] text-[#888] ml-2">· LTC</span>
                        </p>
                        {d.txid && <p className="text-[10px] font-mono text-[#888] truncate max-w-[260px] sm:max-w-md">{d.txid}</p>}
                        <p className="text-[11px] text-[#888] mt-0.5">
                          {new Date(d.created_at).toLocaleDateString()} {new Date(d.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 border inline-flex items-center gap-1 ${
                        st === "approved" ? "bg-[#e8f5e9] border-[#c8e6c9] text-[#2e7d32]" :
                        st === "rejected" || st === "expired" ? "bg-[#fdecea] border-[#f5c6cb] text-[#c0392b]" :
                        "bg-[#fff8e1] border-[#ffe0a0] text-[#b26a00]"
                      }`}>
                        {st === "approved" ? <CheckCircle2 className="h-3 w-3" /> :
                         st === "rejected" || st === "expired" ? <XCircle className="h-3 w-3" /> :
                         <Clock className="h-3 w-3" />}
                        {st}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
};

export default Recharge;
