import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Copy, Gift, RefreshCw, CheckCircle2 } from "lucide-react";
import {
  RedeemCode,
  adminListRedeemCodes,
  adminCreateRedeemCode,
  adminDeleteRedeemCode,
  generateRedeemCodeString,
} from "@/lib/store";

const AdminRedeem = () => {
  const [rows, setRows] = useState<RedeemCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(generateRedeemCodeString());
  const [amount, setAmount] = useState("10");
  const [note, setNote] = useState("");

  const load = async () => {
    try {
      setRows(await adminListRedeemCodes());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load codes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Admin · Redeem codes";
    void load();
  }, []);

  const create = async () => {
    const amt = Number(amount);
    if (!code.trim()) return toast.error("Enter or generate a code");
    if (!amt || amt <= 0) return toast.error("Enter a valid amount");
    setBusy(true);
    try {
      await adminCreateRedeemCode({ code, amount: amt, note });
      toast.success(`Code created — $${amt.toFixed(2)}`);
      setCode(generateRedeemCodeString());
      setNote("");
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create code";
      toast.error(msg.includes("duplicate") ? "This code already exists" : msg);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await adminDeleteRedeemCode(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success("Code deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Code copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const unused = rows.filter((r) => !r.used_by);
  const used = rows.filter((r) => r.used_by);

  return (
    <AdminLayout title="Redeem codes">
      <div className="space-y-6">
        <div className="glass-neon rounded-2xl p-6">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
              <Gift className="h-4 w-4 text-primary-glow" />
            </div>
            <h2 className="font-display text-lg font-bold tracking-tight">Generate a code</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <Label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Code</Label>
              <div className="flex items-center gap-2 mt-1.5">
                <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="font-mono" />
                <button
                  type="button"
                  onClick={() => setCode(generateRedeemCodeString())}
                  title="Generate new code"
                  className="h-10 w-10 shrink-0 rounded-lg border border-border/60 hover:bg-secondary/50 flex items-center justify-center"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Amount ($)</Label>
              <Input
                className="mt-1.5"
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Note (optional)</Label>
              <Input className="mt-1.5" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Telegram giveaway" />
            </div>
          </div>

          <button onClick={create} disabled={busy} className="btn-luxe mt-5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {busy ? "Creating…" : "Create code"}
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Each code can be redeemed only once. Share it on Telegram — the user enters it on the Deposit page and the
            amount is added to their balance instantly.
          </p>
        </div>

        <div className="glass-neon rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold tracking-tight mb-4">
            Unused codes <span className="text-muted-foreground text-sm font-normal">({unused.length})</span>
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : unused.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No unused codes yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {unused.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-foreground truncate">{r.code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      ${r.amount.toFixed(2)}
                      {r.note ? ` · ${r.note}` : ""} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => copy(r.code)}
                      className="h-9 w-9 rounded-lg border border-border/60 hover:bg-secondary/50 flex items-center justify-center"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="h-9 w-9 rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 flex items-center justify-center"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-neon rounded-2xl p-6">
          <h2 className="font-display text-lg font-bold tracking-tight mb-4">
            Redeemed <span className="text-muted-foreground text-sm font-normal">({used.length})</span>
          </h2>
          {used.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Nothing redeemed yet.</p>
          ) : (
            <div className="divide-y divide-border/50">
              {used.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-muted-foreground line-through truncate">{r.code}</p>
                    <p className="text-[11px] text-muted-foreground">
                      ${r.amount.toFixed(2)} · redeemed {r.used_at ? new Date(r.used_at).toLocaleString() : ""}
                    </p>
                  </div>
                  <CheckCircle2 className="h-4 w-4 text-[#2fb344] shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminRedeem;
