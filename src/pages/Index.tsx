import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { newsApi, announcementsApi, ordersApi, type VpsOrder } from "@/lib/api";
import { AnnouncementTicker } from "@/components/shop/AnnouncementTicker";
import { AnnouncementNoticeGrid } from "@/components/shop/AnnouncementNoticeGrid";
import { AppShell } from "@/components/AppShell";
import Seo from "@/components/Seo";

import { useAuth } from "@/hooks/useAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { telegramUrl, telegramLabel } from "@/lib/telegram";
import {
  Activity, Megaphone, ShieldCheck, MessageCircle, ArrowRight,
  Layers, RefreshCw, Send, Wallet, ShoppingBag, TrendingUp, Clock,
} from "lucide-react";


/**
 * Buyer HOME — NeoCast premium layout.
 * Live stock feed + announcements + rules + contact.
 */

const Index = () => {
  const { profile } = useAuth();
  const site = useSiteSettings();
  const [news, setNews] = useState<{ id: string; label: string; count: number }[]>([]);
  const [anns, setAnns] = useState<{ id: string; title: string; body: string; kind?: string; created_at?: string }[]>([]);
  const [orders, setOrders] = useState<VpsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadNews = useCallback(async () => {
    try {
      const res = await newsApi.list();
      setNews((res.updates ?? []) as typeof news);
      setUpdatedAt(new Date());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => {
      const [, a, o] = await Promise.allSettled([
        loadNews(),
        announcementsApi.list(),
        ordersApi.mine(),
      ]);
      if (a.status === "fulfilled" && a.value)
        setAnns((a.value.announcements ?? []) as typeof anns);
      if (o.status === "fulfilled" && o.value)
        setOrders((o.value.orders ?? []) as VpsOrder[]);
      setLoading(false);
    })();
  }, [loadNews]);

  useEffect(() => {
    intervalRef.current = setInterval(loadNews, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadNews]);

  const totalStock = news.reduce((s, n) => s + (Number(n.count) || 0), 0);
  const totalSpend = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const itemsBought = orders.reduce((s, o) => s + (o.items?.length ?? 0), 0);
  const lastOrder = orders[0];
  const topFeeds = [...news].sort((a, b) => (Number(b.count) || 0) - (Number(a.count) || 0)).slice(0, 5);
  const peakFeed = topFeeds[0]?.count ? Number(topFeeds[0].count) : 1;

  return (
    <AppShell>
      <AnnouncementTicker announcements={anns} loading={loading} />
      <Seo title="NeoCast — Home" description="Buyer dashboard, live stock feed and announcements." path="/" />

      {/* HERO */}
      <section className="rounded-xl overflow-hidden bg-[var(--nc-ink)] border border-[var(--nc-line)] relative mb-4">
        <div className="absolute -top-20 -right-16 h-64 w-64 rounded-full bg-[var(--nc-accent)]/25 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-[var(--nc-accent-soft)]/15 blur-3xl" />
        <div className="relative px-5 sm:px-7 py-6 flex flex-col lg:flex-row lg:items-end justify-between gap-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-[var(--nc-accent-soft)] font-semibold">Welcome back</div>
            <h1 className="mt-1.5 text-white text-[22px] sm:text-[27px] font-bold tracking-tight">
              {profile?.username ?? "buyer"}
            </h1>
            <p className="mt-1 text-[12.5px] text-white/50 max-w-lg leading-relaxed">
              Fresh stock is pushed to the shop around the clock. Track new drops in the live feed below.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/shop" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full bg-[var(--nc-accent)] hover:bg-[var(--nc-accent-hi)] text-white text-[12px] font-semibold uppercase tracking-wide transition shadow-[0_6px_18px_-8px_rgba(var(--nc-accent-rgb),0.9)]">
                Browse shop <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link to="/recharge" className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full border border-white/15 text-white/80 hover:text-white hover:border-[var(--nc-accent-soft)] text-[12px] font-semibold uppercase tracking-wide transition">
                Add funds
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:min-w-[460px]">
            <Stat icon={<Wallet className="h-4 w-4" />} label="Balance" value={`$${Number(profile?.balance ?? 0).toFixed(2)}`} />
            <Stat icon={<Layers className="h-4 w-4" />} label="Live items" value={totalStock ? String(totalStock) : "—"} />
            <Stat icon={<ShoppingBag className="h-4 w-4" />} label="Orders" value={String(orders.length)} />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Spent" value={`$${totalSpend.toFixed(2)}`} />
          </div>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-[var(--nc-accent)] via-[var(--nc-accent-soft)] to-transparent" />
      </section>

      {/* QUICK ACTIONS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <QuickAction to="/shop" icon={<ShoppingBag className="h-4 w-4" />} title="Shop" sub={`${totalStock || 0} items live`} />
        <QuickAction to="/cart" icon={<Layers className="h-4 w-4" />} title="Cart" sub="Review selection" />
        <QuickAction to="/orders" icon={<Clock className="h-4 w-4" />} title="Orders" sub={`${itemsBought} items bought`} />
        <QuickAction to="/recharge" icon={<Wallet className="h-4 w-4" />} title="Add funds" sub="Crypto deposits" />
      </div>

      {/* ACCOUNT OVERVIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Panel title="Account overview" icon={<ShieldCheck className="h-4 w-4" />}>
          <div className="px-5 py-4 space-y-3 text-[13px]">
            <Row label="Username" value={profile?.username ?? "—"} />
            <Row label="Available balance" value={`$${Number(profile?.balance ?? 0).toFixed(2)}`} strong />
            <Row label="Lifetime spend" value={`$${totalSpend.toFixed(2)}`} />
            <Row label="Total orders" value={String(orders.length)} />
            <Row
              label="Last purchase"
              value={lastOrder ? new Date(lastOrder.created_at).toLocaleDateString() : "No orders yet"}
            />
          </div>
        </Panel>

        <Panel title="Top stock categories" icon={<TrendingUp className="h-4 w-4" />}>
          <div className="px-5 py-4 space-y-3">
            {topFeeds.length === 0 && <div className="text-[13px] text-[#888] py-4 text-center">No stock data yet.</div>}
            {topFeeds.map((f) => (
              <div key={f.id}>
                <div className="flex items-center justify-between text-[12.5px] mb-1">
                  <span className="text-[#333] truncate pr-2 font-medium">{f.label}</span>
                  <span className="tabular-nums text-[#777]">{f.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#f0f0f0] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--nc-accent)] to-[var(--nc-accent-soft)] transition-all duration-700"
                    style={{ width: `${Math.max(6, ((Number(f.count) || 0) / peakFeed) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Recent orders" icon={<Clock className="h-4 w-4" />}>
          <div className="divide-y divide-[#f0f0f0]">
            {orders.length === 0 && (
              <div className="px-5 py-8 text-center text-[13px] text-[#888]">
                No orders yet. <Link to="/shop" className="text-[var(--nc-accent)] font-semibold">Start shopping →</Link>
              </div>
            )}
            {orders.slice(0, 5).map((o) => (
              <div key={o.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-[#222] truncate">#{String(o.id).slice(0, 8)}</div>
                  <div className="text-[11px] text-[#999]">{new Date(o.created_at).toLocaleString()}</div>
                </div>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-[var(--nc-accent)]">
                  ${Number(o.total || 0).toFixed(2)}
                </span>
              </div>
            ))}
            {orders.length > 0 && (
              <Link to="/orders" className="block px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-[#777] hover:text-[var(--nc-accent)] transition">
                View all orders →
              </Link>
            )}
          </div>
        </Panel>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* LIVE STOCK FEED */}
        <Panel
          title="Live stock feed"
          icon={<Activity className="h-4 w-4" />}
          right={
            <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[#2fb344]">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#2fb344] opacity-70 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2fb344]" />
              </span>
              Live
            </span>
          }
        >
          <div className="max-h-[420px] overflow-y-auto divide-y divide-[#f0f0f0]">
            {loading && Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <div className="h-3 bg-[#f0f0f0] animate-pulse rounded" style={{ width: `${55 + (i % 3) * 14}%` }} />
              </div>
            ))}
            {!loading && news.length === 0 && (
              <div className="px-4 py-10 text-center text-[13px] text-[#888]">No updates yet.</div>
            )}
            {!loading && news.map((n) => (
              <div key={n.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-[#fafafa] transition group">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--nc-accent)] shrink-0" />
                  <span className="text-[13px] text-[#222] truncate font-medium">{n.label}</span>
                </div>
                {n.count ? (
                  <span className="shrink-0 text-[11px] font-semibold tabular-nums px-2 py-0.5 rounded border border-[#e8ccd3] bg-[#fbf1f3] text-[var(--nc-accent)]">
                    {n.count} pcs
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="px-4 py-2.5 border-t border-[#eee] flex items-center justify-between text-[11px] text-[#999]">
            <span className="inline-flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" /> Auto-refresh · 30s
            </span>
            <span>{updatedAt ? `Updated ${updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          </div>
        </Panel>

        {/* LATEST NOTICES */}
        <Panel title="Latest notices" icon={<Megaphone className="h-4 w-4" />}>
          <div className="p-4">
            <AnnouncementNoticeGrid announcements={anns} loading={loading} max={9} />
          </div>
        </Panel>
      </div>

      {/* RULES + CONTACT */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
        <Panel title="Shop rules" icon={<ShieldCheck className="h-4 w-4" />}>
          <ul className="px-5 py-4 space-y-2.5 text-[13px] text-[#444] leading-[1.7]">
            {[
              "By registering you automatically accept the shop rules.",
              "Rules may change without prior notice.",
              "Found a bug or vulnerability? Report it through tickets.",
              "Intentional abuse of bugs for profit leads to a permanent ban.",
              "After clearing the purchases section, data cannot be restored — keep your own copies.",
              "If you lose access to your account, access is lost forever.",
              "Top up wisely. Balance funds are non-refundable.",
              "The shop is not responsible for how you use information from this resource.",
            ].map((r) => (
              <li key={r} className="flex gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--nc-accent)] shrink-0" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Contact information" icon={<MessageCircle className="h-4 w-4" />}>
          <div className="px-5 py-4 space-y-4 text-[13px] text-[#444] leading-[1.7]">
            <p className="rounded-lg bg-[#fbf1f3] border border-[#e8ccd3] px-3.5 py-2.5 text-[var(--nc-accent)]">
              Beware of fake NeoCast support. We never message you first.
            </p>
            <div className="rounded-lg border border-dashed border-[#e0e0e0] px-3.5 py-3 text-[12.5px] text-[#777]">
              Official contact channels will be published here soon.
            </div>
            <p className="text-[12.5px] text-[var(--nc-accent)] font-semibold">Sellers are welcome to join the platform.</p>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
};

function QuickAction({ to, icon, title, sub }: { to: string; icon: React.ReactNode; title: string; sub: string }) {
  return (
    <Link
      to={to}
      className="group rounded-xl border border-[#e6e6e6] bg-white px-4 py-3.5 flex items-center gap-3 transition-all duration-300 hover:border-[var(--nc-accent)]/45 hover:shadow-[0_10px_26px_-16px_rgba(var(--nc-accent-rgb),0.9)] hover:-translate-y-[2px]"
    >
      <span className="h-9 w-9 rounded-lg bg-[var(--nc-ink-2)] text-[var(--nc-accent-pale)] flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[#1a1a1a]">{title}</span>
        <span className="block text-[11px] text-[#888] truncate">{sub}</span>
      </span>
      <ArrowRight className="h-4 w-4 ml-auto text-[#ccc] group-hover:text-[var(--nc-accent)] transition" />
    </Link>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-[#eee] pb-2 last:border-0 last:pb-0">
      <span className="text-[12px] text-[#888]">{label}</span>
      <span className={`tabular-nums truncate ${strong ? "text-[15px] font-bold text-[var(--nc-accent)]" : "text-[13px] font-medium text-[#222]"}`}>{value}</span>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {

  return (
    <div className="rounded-lg border border-[#333] bg-[var(--nc-ink-2)] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[var(--nc-accent-soft)]">{icon}</div>
      <div className="mt-1.5 text-[16px] font-bold text-white tabular-nums truncate">{value}</div>
      <div className="text-[9px] uppercase tracking-[0.18em] text-white/40">{label}</div>
    </div>
  );
}

function Panel({ title, icon, right, children }: { title: string; icon?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#e6e6e6] rounded-lg overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
      <header className="px-4 h-11 bg-[var(--nc-ink-2)] border-b-2 border-[var(--nc-accent)] flex items-center justify-between">
        <h2 className="text-[12.5px] font-medium text-white/85 uppercase tracking-[0.14em] flex items-center gap-2">
          <span className="text-[var(--nc-accent-soft)]">{icon}</span>{title}
        </h2>
        {right}
      </header>
      <div>{children}</div>
    </section>
  );
}

export default Index;
