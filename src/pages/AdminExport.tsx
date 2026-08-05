import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { toast } from "sonner";
import { Download, Loader2, CalendarRange, Database, ShieldCheck, RefreshCw } from "lucide-react";
import {
  adminListBaseGroups, adminExportCards, exportedCardsToCsv, downloadTextFile,
  todayISO, type BaseGroup, type ExportedCard,
} from "@/lib/store";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

const inputCls =
  "h-9 w-full rounded-md border border-border/60 bg-input/40 px-3 text-sm text-foreground outline-none focus:border-primary/60";
const labelCls = "text-[10px] uppercase tracking-widest text-muted-foreground";

const AdminExport = () => {
  const [preset, setPreset] = useState<Preset>("today");
  const [from, setFrom] = useState(todayISO());
  const [to, setTo] = useState(todayISO());
  const [base, setBase] = useState("");
  const [includeSold, setIncludeSold] = useState(false);
  const [groups, setGroups] = useState<BaseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ExportedCard[] | null>(null);

  useEffect(() => {
    document.title = "Admin · Card export";
    void reload();
  }, []);

  const reload = async () => {
    setLoading(true);
    try {
      setGroups(await adminListBaseGroups(90));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bases");
    } finally {
      setLoading(false);
    }
  };

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "today") { setFrom(todayISO()); setTo(todayISO()); }
    else if (p === "yesterday") { setFrom(todayISO(-1)); setTo(todayISO(-1)); }
    else if (p === "7d") { setFrom(todayISO(-6)); setTo(todayISO()); }
    else if (p === "30d") { setFrom(todayISO(-29)); setTo(todayISO()); }
  };

  const baseNames = useMemo(
    () => [...new Set(groups.map((g) => g.base).filter((b) => b && b !== "—"))].sort(),
    [groups],
  );

  const inRange = useMemo(
    () => groups.filter((g) => g.base_date >= from && g.base_date <= to && (!base || g.base === base)),
    [groups, from, to, base],
  );
  const rangeTotal = inRange.reduce((n, g) => n + g.total, 0);
  const rangeAvailable = inRange.reduce((n, g) => n + g.available, 0);

  const runExport = async (format: "csv" | "txt") => {
    setBusy(true);
    try {
      const rows = await adminExportCards({ from, to, base: base || null, includeSold });
      setLastResult(rows);
      if (!rows.length) { toast.error("No cards found for this filter"); return; }
      const stamp = from === to ? from : `${from}_to_${to}`;
      if (format === "csv") {
        downloadTextFile(`cards_${stamp}.csv`, exportedCardsToCsv(rows));
      } else {
        downloadTextFile(`cards_${stamp}.txt`, rows.map((r) => r.content).join("\n"));
      }
      toast.success(`Downloaded ${rows.length} cards`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminLayout title="Card export">
      <div className="space-y-6">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-primary/5 border border-primary/20">
          <ShieldCheck className="h-4 w-4 text-primary-glow shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            Super admin only. Full card details are downloadable here — regular admins can upload and manage
            cards but can never read or export the raw card lines.
          </p>
        </div>

        {/* FILTERS */}
        <section className="glass rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary-glow" />
            <h2 className="text-sm font-semibold">Filter by base date</h2>
            <button onClick={() => void reload()} className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {([
              ["today", "Today"], ["yesterday", "Yesterday"], ["7d", "Last 7 days"],
              ["30d", "Last 30 days"], ["custom", "Custom range"],
            ] as [Preset, string][]).map(([p, label]) => (
              <button
                key={p}
                onClick={() => applyPreset(p)}
                className={`px-3 py-2 rounded-lg text-xs uppercase tracking-wider transition ${
                  preset === p
                    ? "bg-primary/20 border border-primary/60 text-primary-glow"
                    : "bg-secondary/40 border border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >{label}</button>
            ))}
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <div className={labelCls}>From</div>
              <input type="date" className={inputCls} value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} />
            </div>
            <div className="space-y-1.5">
              <div className={labelCls}>To</div>
              <input type="date" className={inputCls} value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} />
            </div>
            <div className="space-y-1.5">
              <div className={labelCls}>Base</div>
              <select className={inputCls} value={base} onChange={(e) => setBase(e.target.value)}>
                <option value="">All bases</option>
                {baseNames.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <div className={labelCls}>Sold cards</div>
              <select className={inputCls} value={includeSold ? "yes" : "no"} onChange={(e) => setIncludeSold(e.target.value === "yes")}>
                <option value="no">Unsold only</option>
                <option value="yes">Include sold</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <span className="text-xs text-muted-foreground">
              In range: <b className="text-foreground">{rangeTotal}</b> cards · available <b className="text-foreground">{rangeAvailable}</b>
            </span>
            <button
              onClick={() => void runExport("csv")}
              disabled={busy}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download CSV
            </button>
            <button
              onClick={() => void runExport("txt")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-5 py-2 text-sm font-medium text-primary-glow disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Download TXT
            </button>
          </div>

          {lastResult && (
            <p className="text-[11px] text-muted-foreground">
              Last export: {lastResult.length} card lines ({from} → {to}{base ? ` · ${base}` : ""}).
            </p>
          )}
        </section>

        {/* BASE HISTORY */}
        <section className="glass rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-4 w-4 text-primary-glow" />
            <h2 className="text-sm font-semibold">Upload history by base date</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="text-[10px] uppercase tracking-wider text-muted-foreground bg-secondary/40">
                <tr>
                  <th className="p-2 text-left">Base date</th>
                  <th className="p-2 text-left">Base</th>
                  <th className="p-2 text-right">Uploaded</th>
                  <th className="p-2 text-right">Available</th>
                  <th className="p-2 text-right">Sold</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={`${g.base_date}-${g.base}`} className="border-t border-border/40 hover:bg-secondary/20">
                    <td className="p-2 font-mono text-xs">{g.base_date}</td>
                    <td className="p-2 text-xs text-muted-foreground">{g.base}</td>
                    <td className="p-2 text-right">{g.total}</td>
                    <td className="p-2 text-right text-success">{g.available}</td>
                    <td className="p-2 text-right text-muted-foreground">{g.sold}</td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => { setPreset("custom"); setFrom(g.base_date); setTo(g.base_date); setBase(g.base === "—" ? "" : g.base); }}
                        className="text-xs text-primary-glow hover:underline"
                      >Select</button>
                    </td>
                  </tr>
                ))}
                {!loading && groups.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">No uploads yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
};

export default AdminExport;
