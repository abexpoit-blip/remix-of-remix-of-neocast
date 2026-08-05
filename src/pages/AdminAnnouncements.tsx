import { useEffect, useState } from "react";
import { AdminLayout } from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listAnnouncements,
  adminCreateAnnouncement,
  adminDeleteAnnouncement,
  type Announcement,
} from "@/lib/store";
import { toast } from "sonner";
import { Megaphone, Trash2, Calendar, Loader2 } from "lucide-react";

const KINDS = [
  { value: "info", label: "Info" },
  { value: "warning", label: "Warning" },
  { value: "promo", label: "Promo" },
];

export default function AdminAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState("info");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await listAnnouncements();
      setAnnouncements(rows);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    setSubmitting(true);
    try {
      await adminCreateAnnouncement({ title: title.trim(), body: body.trim(), kind });
      toast.success("Announcement published");
      setTitle("");
      setBody("");
      setKind("info");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    setDeleting(id);
    try {
      await adminDeleteAnnouncement(id);
      toast.success("Announcement deleted");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <AdminLayout title="Announcements">
      <div className="space-y-6">
        {/* Create form */}
        <section className="rounded-xl border border-border/50 bg-card/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4 flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Publish new announcement
          </h2>
          <div className="grid gap-4 md:grid-cols-[1fr_140px] lg:grid-cols-[1fr_1fr_140px]">
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. New US drop live"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Kind</label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 lg:col-span-3 space-y-2">
              <label className="text-xs font-medium text-muted-foreground">Body</label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Write the full message..."
                rows={4}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleSubmit} disabled={submitting} className="min-w-[120px]">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publish"}
            </Button>
          </div>
        </section>

        {/* List */}
        <section className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
          <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">All announcements</h2>
            <span className="text-xs text-muted-foreground">{announcements.length} total</span>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : announcements.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No announcements yet.</div>
          ) : (
            <div className="divide-y divide-border/50">
              {announcements.map((a) => (
                <div key={a.id} className="px-5 py-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                        {a.kind || "info"}
                      </span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">{a.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{a.body}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(a.id)}
                    disabled={deleting === a.id}
                    className="shrink-0 text-destructive hover:text-destructive"
                  >
                    {deleting === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminLayout>
  );
}
