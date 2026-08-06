import { useEffect, useMemo, useState } from "react";
import { Megaphone, X, ChevronDown, CheckCheck, Info, AlertTriangle, Gift } from "lucide-react";
import type { Announcement } from "@/lib/store";

const READ_KEY = "neocast.notices.read";
const DISMISS_KEY = "neocast.notices.dismissed";

const readIds = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
};

const writeIds = (key: string, ids: string[]) => {
  try { localStorage.setItem(key, JSON.stringify(ids.slice(-200))); } catch { /* ignore */ }
};

const kindStyle = (kind: string) => {
  switch ((kind || "info").toLowerCase()) {
    case "warning":
      return { Icon: AlertTriangle, label: "Warning", cls: "text-amber-300 bg-amber-400/10 border-amber-400/25" };
    case "promo":
      return { Icon: Gift, label: "Promo", cls: "text-emerald-300 bg-emerald-400/10 border-emerald-400/25" };
    default:
      return { Icon: Info, label: "Info", cls: "text-sky-300 bg-sky-400/10 border-sky-400/25" };
  }
};

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

/** Login-page notice board: read tracking, per-notice dismiss, expandable bodies. */
export function AuthNoticeBoard({ notices }: { notices: Announcement[] }) {
  const [read, setRead] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setRead(readIds(READ_KEY));
    setDismissed(readIds(DISMISS_KEY));
  }, []);

  const visible = useMemo(
    () => notices.filter((n) => !dismissed.includes(n.id)),
    [notices, dismissed],
  );
  const unread = visible.filter((n) => !read.includes(n.id)).length;

  const markRead = (id: string) => {
    setRead((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      writeIds(READ_KEY, next);
      return next;
    });
  };

  const markAllRead = () => {
    const next = Array.from(new Set([...read, ...visible.map((n) => n.id)]));
    setRead(next);
    writeIds(READ_KEY, next);
  };

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = [...prev, id];
      writeIds(DISMISS_KEY, next);
      return next;
    });
    setOpenId((cur) => (cur === id ? null : cur));
  };

  const toggle = (id: string) => {
    setOpenId((cur) => (cur === id ? null : id));
    markRead(id);
  };

  if (visible.length === 0) return null;

  return (
    <section
      aria-label="Notice board"
      className="mb-5 rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-md overflow-hidden shadow-[0_10px_30px_-18px_rgba(0,0,0,0.9)]"
    >
      <header className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 bg-[var(--nc-accent)]/10">
        <Megaphone className="h-3.5 w-3.5 text-[var(--nc-accent-soft)]" />
        <span className="text-[10.5px] uppercase tracking-[0.2em] font-semibold text-[var(--nc-accent-soft)]">
          Notice board
        </span>
        {unread > 0 && (
          <span className="ml-0.5 min-w-[18px] rounded-full bg-[var(--nc-accent)] px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {unread > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10.5px] font-semibold text-white/60 hover:text-white hover:bg-white/10 transition"
            >
              <CheckCheck className="h-3 w-3" /> Mark all read
            </button>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand notices" : "Collapse notices"}
            className="rounded-md p-1 text-white/50 hover:text-white hover:bg-white/10 transition"
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`} />
          </button>
        </div>
      </header>

      {!collapsed && (
        <ul className="divide-y divide-white/5 max-h-56 overflow-y-auto">
          {visible.map((n) => {
            const { Icon, label, cls } = kindStyle(n.kind);
            const isRead = read.includes(n.id);
            const isOpen = openId === n.id;
            return (
              <li key={n.id} className={`relative px-3 py-2.5 transition ${isRead ? "opacity-70" : "bg-white/[0.02]"}`}>
                {!isRead && (
                  <span className="absolute left-0 top-0 h-full w-[2px] bg-[var(--nc-accent)]" aria-hidden />
                )}
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide ${cls}`}>
                    <Icon className="h-2.5 w-2.5" /> {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(n.id)}
                    className="flex-1 text-left"
                    aria-expanded={isOpen}
                  >
                    <div className={`text-[12.5px] leading-snug ${isRead ? "font-medium text-white/75" : "font-semibold text-white"}`}>
                      {n.title}
                    </div>
                    {n.body ? (
                      <div
                        className={`text-[11.5px] text-white/55 mt-0.5 leading-relaxed ${isOpen ? "" : "line-clamp-1"}`}
                      >
                        {n.body}
                      </div>
                    ) : null}
                    <div className="mt-1 text-[10px] text-white/35">{timeAgo(n.created_at)}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(n.id)}
                    aria-label={`Dismiss notice: ${n.title}`}
                    className="rounded-md p-1 text-white/40 hover:text-white hover:bg-white/10 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
