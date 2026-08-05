import { useEffect, useRef, useState } from "react";
import { Megaphone, AlertTriangle, Sparkles, Info } from "lucide-react";

export interface TickerAnnouncement {
  id: string;
  title: string;
  body?: string;
  kind?: string;
}

interface AnnouncementTickerProps {
  announcements: TickerAnnouncement[];
  loading?: boolean;
}

const kindMeta: Record<string, { icon: typeof Info; color: string; label: string }> = {
  warning: { icon: AlertTriangle, color: "#f59e0b", label: "Warning" },
  promo: { icon: Sparkles, color: "#fbbf24", label: "Promo" },
  info: { icon: Info, color: "#38bdf8", label: "Info" },
};

export function AnnouncementTicker({ announcements, loading }: AnnouncementTickerProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReduced(m.matches);
    const handler = () => setPrefersReduced(m.matches);
    m.addEventListener("change", handler);
    return () => m.removeEventListener("change", handler);
  }, []);

  if (loading) {
    return (
      <div className="h-9 w-full bg-[var(--nc-ink)] border-b border-[var(--nc-line)] animate-pulse" />
    );
  }

  if (!announcements.length) return null;

  const items = announcements.slice(0, 12);
  const renderItem = (a: TickerAnnouncement, i: number) => {
    const meta = kindMeta[a.kind || "info"] || kindMeta.info;
    const Icon = meta.icon;
    return (
      <div
        key={`${a.id}-${i}`}
        className="inline-flex items-center gap-2 px-4 text-[12px] font-medium text-white/90 whitespace-nowrap"
      >
        <span className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 bg-black/20 text-[10px] uppercase tracking-wider font-bold" style={{ color: meta.color }}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
        <span className="truncate max-w-[260px] sm:max-w-[320px] md:max-w-[420px]">{a.title}</span>
        {a.body ? (
          <span className="hidden sm:inline text-white/55 truncate max-w-[220px]">— {a.body}</span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="relative w-full overflow-hidden bg-[var(--nc-ink)] border-b border-[var(--nc-line)] h-9">
      <div className="absolute left-0 top-0 bottom-0 z-10 flex items-center px-3 bg-gradient-to-r from-[var(--nc-ink)] via-[var(--nc-ink)] to-transparent">
        <Megaphone className="h-4 w-4 text-[var(--nc-accent-soft)]" />
      </div>
      <div
        ref={trackRef}
        className="flex items-center h-full"
        style={{
          animation: prefersReduced ? "none" : "nc-ticker 60s linear infinite",
          width: "max-content",
        }}
      >
        {items.map(renderItem)}
        {items.map((a, i) => renderItem(a, i + items.length))}
      </div>
      <div className="absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-[var(--nc-ink)] to-transparent pointer-events-none" />
      <style>{`
        @keyframes nc-ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
