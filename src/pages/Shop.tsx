import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";
import { toast } from "sonner";
import { Search, RotateCcw, Loader2, Copy, CheckCircle2, X } from "lucide-react";
import { listProducts, type Product } from "@/lib/store";
import { addToCart, cartCount, onCartChange } from "@/lib/cart";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { detectBrandFromBin, countryCode } from "@/lib/brands";

const Shop = () => {
  const { profile, refresh: refreshProfile } = useAuth();
  const [all, setAll] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(true);
  const [buying, setBuying] = useState(false);
  const [delivered, setDelivered] = useState<{ title: string; content: string } | null>(null);

  const [bin, setBin] = useState("");
  const [base, setBase] = useState("all");
  const [country, setCountry] = useState("all");
  const [zip, setZip] = useState("");
  const [brand, setBrand] = useState("all");
  const [hasZip, setHasZip] = useState(false);
  const [hasPhone, setHasPhone] = useState(false);
  const [hasEmail, setHasEmail] = useState(false);
  const [refundable, setRefundable] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [lastBin, setLastBin] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  type Query = {
    bin: string; base: string; country: string; zip: string; brand: string;
    hasZip: boolean; hasPhone: boolean; hasEmail: boolean; refundable: boolean;
    minPrice: string; maxPrice: string;
  };
  const emptyQuery: Query = {
    bin: "", base: "all", country: "all", zip: "", brand: "all",
    hasZip: false, hasPhone: false, hasEmail: false, refundable: false,
    minPrice: "", maxPrice: "",
  };
  const [q, setQ] = useState<Query>(emptyQuery);


  const lastLoad = useRef(0);
  const load = async (force = false) => {
    if (!force && Date.now() - lastLoad.current < 60_000) return;
    lastLoad.current = Date.now();
    setLoading(true);
    try {
      setAll(await listProducts());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
      setAll([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(true);
    // Refresh stock when the tab becomes visible again, but at most once a minute.
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);


  const bases = useMemo(
    () => [...new Set(all.map((p) => p.base).filter(Boolean) as string[])].sort(),
    [all],
  );
  const countries = useMemo(
    () => [...new Set(all.map((p) => p.country).filter(Boolean) as string[])].sort(),
    [all],
  );
  const brands = useMemo(
    () => [...new Set(all.map((p) => p.brand || detectBrandFromBin(p.bin ?? "")).filter(Boolean) as string[])].sort(),
    [all],
  );

  const cards = useMemo(() => {
    if (!searched) return [];
    const binList = q.bin.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const zipList = q.zip.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    const min = q.minPrice ? Number(q.minPrice) : null;
    const max = q.maxPrice ? Number(q.maxPrice) : null;
    return all.filter((p) => {
      if (binList.length && !binList.some((b) => (p.bin ?? "").startsWith(b))) return false;
      if (zipList.length && !zipList.some((z) => (p.zip ?? "").startsWith(z))) return false;
      if (q.base !== "all" && (p.base ?? "") !== q.base) return false;
      if (q.country !== "all" && (p.country ?? "") !== q.country) return false;
      if (q.brand !== "all" && (p.brand || detectBrandFromBin(p.bin ?? "")) !== q.brand) return false;
      if (q.hasZip && !p.zip) return false;
      if (q.hasPhone && !p.has_phone) return false;
      if (q.hasEmail && !p.has_email) return false;
      if (q.refundable && !p.refundable) return false;
      if (min !== null && Number(p.price) < min) return false;
      if (max !== null && Number(p.price) > max) return false;
      return true;
    });
  }, [all, q, searched]);

  const PER_PAGE = 50;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(cards.length / PER_PAGE));
  useEffect(() => { setPage(1); }, [q, all.length]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);
  const pageCards = useMemo(
    () => cards.slice((page - 1) * PER_PAGE, page * PER_PAGE),
    [cards, page],
  );

  const currentQuery = (): Query => ({
    bin, base, country, zip, brand, hasZip, hasPhone, hasEmail, refundable, minPrice, maxPrice,
  });

  const runSearch = () => {
    setQ(currentQuery());
    setLastBin(bin.trim());
    setSearched(true);
    setSelected(new Set());
  };

  const reset = () => {
    setBin(""); setBase("all"); setCountry("all"); setZip(""); setBrand("all");
    setHasZip(false); setHasPhone(false); setHasEmail(false); setRefundable(false);
    setMinPrice(""); setMaxPrice("");
    setQ(emptyQuery);
    setSearched(true); setLastBin(""); setSelected(new Set());
    void load(true);
  };


  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(cartCount());
    return onCartChange(() => setCount(cartCount()));
  }, []);

  const toggle = (id: string) =>

    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () =>
    setSelected((s) => (s.size === pageCards.length ? new Set() : new Set(pageCards.map((c) => c.id))));


  const buyMany = (ids: string[]) => {
    if (!ids.length) return toast.error("Select cards first");
    const items = all.filter((p) => ids.includes(p.id));
    const added = addToCart(items);
    setSelected(new Set());
    if (added === 0) toast.info("Already in cart");
    else toast.success(`Added to cart: ${added}`);
  };


  const noResults = !loading && searched && cards.length === 0;

  return (
    <AppShell>
      <Seo
        title="Shop | NeoCast"
        description="Live stock. Search by BIN, base, country and ZIP."
        path="/shop"
      />

      {/* FILTER PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Panel 1 — bulk inputs */}
        <div className="bg-white border border-[#e6e6e6] p-3 sm:p-4 space-y-3">
          <Field label="Bins">
            <textarea
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              placeholder="Please use a carriage return to separate multiple records."
              rows={3}
              className="w-full border border-[#dcdcdc] px-2 py-1.5 text-[13px] font-mono outline-none resize-none focus:border-[var(--nc-accent)]"
            />
          </Field>
          <Field label="Zips">
            <textarea
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="Please use a carriage return to separate multiple records."
              rows={3}
              className="w-full border border-[#dcdcdc] px-2 py-1.5 text-[13px] font-mono outline-none resize-none focus:border-[var(--nc-accent)]"
            />
          </Field>
          <Field label="Base">
            <select
              value={base}
              onChange={(e) => setBase(e.target.value)}
              className="h-9 w-full border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[var(--nc-accent)]"
            >
              <option value="all">All</option>
              {bases.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        </div>

        {/* Panel 2 — country + attribute toggles */}
        <div className="bg-white border border-[#e6e6e6] p-3 sm:p-4 space-y-3">
          <Field label="Country">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="h-9 w-full border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[var(--nc-accent)]"
            >
              <option value="all">All</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="border border-[#eee] divide-y divide-[#f2f2f2]">
            <Toggle label="ZIP" checked={hasZip} onChange={setHasZip} />
            <Toggle label="Phone" checked={hasPhone} onChange={setHasPhone} />
            <Toggle label="Mail" checked={hasEmail} onChange={setHasEmail} />
            <Toggle label="Refundable" checked={refundable} onChange={setRefundable} />
          </div>
        </div>

        {/* Panel 3 — brand + price */}
        <div className="bg-white border border-[#e6e6e6] p-3 sm:p-4 space-y-3">
          <Field label="Brand">
            <select
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="h-9 w-full border border-[#dcdcdc] px-2 text-[13px] outline-none bg-white focus:border-[var(--nc-accent)]"
            >
              <option value="all">All</option>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Price range">
            <div className="flex items-center gap-2">
              <input
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Min Price"
                className="h-9 w-full border border-[#dcdcdc] px-2 text-[13px] outline-none focus:border-[var(--nc-accent)]"
              />
              <span className="text-[#999]">-</span>
              <input
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && runSearch()}
                placeholder="Max Price"
                className="h-9 w-full border border-[#dcdcdc] px-2 text-[13px] outline-none focus:border-[var(--nc-accent)]"
              />
            </div>
          </Field>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="h-9 px-8 bg-[var(--nc-ink)] hover:bg-[#000] text-white text-[13px] uppercase tracking-wide inline-flex items-center justify-center gap-2 transition"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </button>
        <button
          onClick={runSearch}
          className="h-9 px-8 bg-[var(--nc-accent)] hover:bg-[#a91f1f] text-white text-[13px] uppercase tracking-wide inline-flex items-center justify-center gap-2 transition"
        >
          <Search className="h-3.5 w-3.5" /> Search
        </button>
      </div>


      {/* BATCH ADD BUTTON */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => void buyMany(Array.from(selected))}
          disabled={selected.size === 0 || buying}
          className="h-7 px-3 bg-[#e8f5e9] hover:bg-[#dcedc8] border border-[#c8e6c9] text-[#2e7d32] text-[12px] transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          Batch add shopping cart{selected.size > 0 ? ` (${selected.size})` : ""}
        </button>
        <div className="flex items-center gap-4 text-[12px] text-[#888]">
          {cards.length > 0 ? <span>{cards.length} results · page {page}/{totalPages}</span> : null}
          <Link to="/cart" className="text-[#2196f3] hover:underline">
            Cart{count > 0 ? ` (${count})` : ""}
          </Link>
        </div>

      </div>

      {/* TABLE */}
      <div className="mt-3 border border-[#e6e6e6] bg-white overflow-x-auto -mx-3 sm:mx-0">
        <table className="w-full min-w-[1000px] text-[13px] border-collapse">

          <thead>
            <tr className="bg-[#fafafa] text-[#555] text-[12px]">
              <th className="p-2 w-8 border-b border-[#eee]">
                <input
                  type="checkbox"
                  checked={pageCards.length > 0 && selected.size === pageCards.length}
                  onChange={toggleAll}
                  className="cursor-pointer accent-[#2196f3]"
                />
              </th>
              {["BIN","refund","month","year","city","state","zip","country","tel","email","prices","base","operation"].map((h) => (
                <th key={h} className="p-2 text-center font-normal border-b border-[#eee]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[#f0f0f0]">
                <td colSpan={14} className="p-3"><div className="h-4 bg-[#f5f5f5] animate-pulse" /></td>
              </tr>
            ))}
            {!loading && pageCards.map((c) => (
              <tr key={c.id} className="border-b border-[#f0f0f0] hover:bg-[#fafcff] transition">
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="cursor-pointer accent-[#2196f3]"
                  />
                </td>
                <td className="p-2 text-center font-mono text-[#333]">
                  <span>{c.bin ?? "—"}<span className="text-[#bbb]">••••••</span></span>
                </td>
                <td className="p-2 text-center text-[#2196f3]">{c.refundable ? "YES" : "NO"}</td>
                <td className="p-2 text-center font-mono">{c.exp_month ?? "—"}</td>
                <td className="p-2 text-center font-mono">{c.exp_year ?? "—"}</td>
                <td className="p-2 text-center max-w-[140px] truncate" title={c.city ?? ""}>{c.city ?? "—"}</td>
                <td className="p-2 text-center">{c.state ?? "—"}</td>
                <td className="p-2 text-center font-mono">{c.zip ?? "—"}</td>
                <td className="p-2 text-center">{c.country ? countryCode(c.country) : "—"}</td>

                <td className="p-2 text-center">{c.has_phone ? "yes" : "no"}</td>
                <td className="p-2 text-center">{c.has_email ? "yes" : "no"}</td>
                <td className="p-2 text-center font-mono">{Number(c.price).toFixed(2)}</td>
                <td className="p-2 text-center text-[11px] text-[#666] max-w-[180px]">
                  <span className="whitespace-pre-line break-words">{c.base ?? "—"}</span>
                </td>
                <td className="p-2 text-center">
                  {c.delivery_type === "key" && c.stock <= 0 ? (
                    <span className="text-[#bbb] text-[12px]">out of stock</span>
                  ) : (
                    <button
                      onClick={() => void buyMany([c.id])}
                      disabled={buying}
                      className="text-[#2196f3] hover:underline text-[12px] disabled:opacity-50"
                    >
                      Add to cart
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!loading && noResults && (
              <tr>
                <td colSpan={14} className="p-10 text-center text-[#888] text-[13px]">
                  {lastBin
                    ? <>No cards match BIN prefix <code className="px-1 bg-[#f5f5f5] font-mono">{lastBin}</code>.</>
                    : "No cards match your filters."}
                  <div className="mt-2">
                    <button onClick={reset} className="text-[#2196f3] hover:underline">Clear search</button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !searched && (
              <tr>
                <td colSpan={14} className="p-10 text-center text-[#888] text-[13px]">
                  Search for a BIN above to find cards in stock.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {!loading && cards.length > PER_PAGE && (
        <div className="mt-3 flex items-center justify-end gap-1 text-[12px]">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="h-7 px-3 border border-[#dcdcdc] bg-white text-[#555] hover:bg-[#f7f7f7] disabled:opacity-40"
          >
            ‹
          </button>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-2 text-[#aaa]">…</span>
            ) : (
              <button
                key={n}
                onClick={() => setPage(n as number)}
                className={`h-7 min-w-[28px] px-2 border ${
                  n === page
                    ? "border-[#2196f3] bg-[#2196f3] text-white"
                    : "border-[#dcdcdc] bg-white text-[#555] hover:bg-[#f7f7f7]"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="h-7 px-3 border border-[#dcdcdc] bg-white text-[#555] hover:bg-[#f7f7f7] disabled:opacity-40"
          >
            ›
          </button>
        </div>
      )}



      {buying && (
        <div className="mt-3 text-[12px] text-[#888] inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processing…
        </div>
      )}

      {delivered && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDelivered(null)}>
          <div className="w-full max-w-lg bg-white border border-[#e6e6e6]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
              <div className="flex items-center gap-2 text-[14px] text-[#303133]">
                <CheckCircle2 className="h-4 w-4 text-[#4caf50]" /> {delivered.title}
              </div>
              <button onClick={() => setDelivered(null)} className="text-[#909399] hover:text-[#303133]"><X className="h-4 w-4" /></button>
            </div>
            <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-all p-4 font-mono text-[12px] text-[#303133]">{delivered.content}</pre>
            <div className="border-t border-[#f0f0f0] px-4 py-3 text-right">
              <button
                onClick={() => { void navigator.clipboard.writeText(delivered.content); toast.success("Copied"); }}
                className="h-8 px-4 bg-[#2196f3] hover:bg-[#1e88e5] text-white text-[13px] inline-flex items-center gap-1.5"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
};

function pageNumbers(page: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push("…");
  for (let i = start; i <= end; i++) out.push(i);
  if (end < total - 1) out.push("…");
  out.push(total);
  return out;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-3.5 w-[3px] bg-[var(--nc-accent)]" />
        <span className="text-[#333] text-[12px] font-medium">{label}</span>
      </div>
      {children}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between px-3 py-2 cursor-pointer select-none">
      <span className="flex items-center gap-2 text-[13px] text-[#444]">
        <span className="h-3.5 w-[3px] bg-[var(--nc-accent)]" />
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        aria-pressed={checked}
        aria-label={label}
        className={`relative h-5 w-9 rounded-full transition ${checked ? "bg-[var(--nc-accent)]" : "bg-[#dcdcdc]"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
    </label>
  );
}


export default Shop;
