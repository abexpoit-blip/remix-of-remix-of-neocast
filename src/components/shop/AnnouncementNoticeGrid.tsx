import { Megaphone, AlertTriangle, Sparkles, Info, Calendar } from "lucide-react";

export interface NoticeAnnouncement {
  id: string;
  title: string;
  body?: string;
  kind?: string;
  created_at?: string;
}

interface AnnouncementNoticeGridProps {
  announcements: NoticeAnnouncement[];
  loading?: boolean;
  max?: number;
}

const kindMeta: Record<string, { icon: typeof Info; color: string; label: string; bg: string }> = {
  warning: { icon: AlertTriangle, color: "#f59e0b", label: "Warning", bg: "rgba(245,158,11,0.08)" },
  promo: { icon: Sparkles, color: "#fbbf24", label: "Promo", bg: "rgba(251,191,36,0.08)" },
  info: { icon: Info, color: "#38bdf8", label: "Info", bg: "rgba(56,189,248,0.08)" },
};

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export function AnnouncementNoticeGrid({ announcements, loading, max = 10 }: AnnouncementNoticeGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-36 rounded-lg bg-[#f0f0f0] animate-pulse" />
        ))}
      </div>
    );
  }

  const items = announcements.slice(0, max);

  if (!items.length) {
    return (
      <div className="rounded-lg border border-[#e6e6e6] bg-white p-6 text-center">
        <Megaphone className="h-5 w-5 text-[var(--nc-accent)] mx-auto mb-2" />
        <h3 className="text-[15px] font-semibold text-[#1a1a1a]">Welcome to NeoCast</h3>
        <p className="mt-1 text-[13px] text-[#666]">No announcements yet. Check back for drops and updates.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((a) => {
        const meta = kindMeta[a.kind || "info"] || kindMeta.info;
        const Icon = meta.icon;
        return (
          <article
            key={a.id}
            className="group relative rounded-lg border border-[#e6e6e6] bg-white p-4 overflow-hidden transition-all hover:border-[var(--nc-accent)]/40 hover:shadow-[0_8px_24px_-10px_rgba(var(--nc-accent-rgb),0.18)]"
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-1"
              style={{ backgroundColor: meta.color }}
            />
            <div className="flex items-start justify-between gap-3 mb-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold"
                style={{ color: meta.color, backgroundColor: meta.bg }}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-[#999]">
                <Calendar className="h-3 w-3" /> {formatDate(a.created_at)}
              </span>
            </div>
            <h3 className="text-[14px] font-semibold text-[#1a1a1a] leading-snug mb-1">{a.title}</h3>
            {a.body ? (
              <p className="text-[12.5px] text-[#555] leading-relaxed line-clamp-3 whitespace-pre-line">{a.body}</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
