"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Button, Card, Chip } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { briefTypeLabel } from "@/lib/studio";

interface Asset {
  id: string;
  fileName: string | null;
  round: number;
}
interface Task {
  id: string;
  title: string;
  briefType: string;
  round: number;
  assets: Asset[];
}

interface Attach {
  fileKey: string;
  fileName: string;
  mimeType: string | null;
}

export default function StudioApprovals() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [attach, setAttach] = useState<Record<string, Attach[]>>({});
  const [upId, setUpId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api<{ tasks: Task[] }>("/api/my-design-tasks");
      setTasks(d.tasks);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadAttach(id: string, files: FileList) {
    setUpId(id);
    try {
      const added: Attach[] = [];
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("category", "design");
        const up = await fetch("/api/uploads/direct", { method: "POST", body: fd });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error || "העלאה נכשלה");
        added.push({ fileKey: uj.key, fileName: uj.fileName, mimeType: uj.mimeType });
      }
      setAttach((p) => ({ ...p, [id]: [...(p[id] ?? []), ...added] }));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUpId(null);
    }
  }

  async function decide(id: string, decision: "approved" | "changes") {
    const text = notes[id] ?? "";
    if (decision === "changes" && !text.trim()) {
      alert("נא לפרט מה לתקן");
      return;
    }
    setBusy(id);
    try {
      await api(`/api/design-tasks/${id}/feedback`, {
        method: "POST",
        json: { decision, text: text || null, attachments: attach[id]?.length ? attach[id] : undefined },
      });
      setAttach((p) => ({ ...p, [id]: [] }));
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!loaded) return null;
  if (tasks.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-slate-500">אין עיצובים הממתינים לאישורך כרגע 🎉</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {tasks.map((t) => (
        <Card key={t.id}>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-100">{t.title}</h3>
            <Chip color="#818cf8">{briefTypeLabel(t.briefType)}</Chip>
            {t.round > 1 ? <Chip color="#f97316">סבב {t.round}</Chip> : null}
          </div>
          <div className="mb-3 flex flex-col gap-1.5">
            {t.assets.map((a) => (
              <a
                key={a.id}
                href={`/api/design-assets/${a.id}`}
                target="_blank"
                className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-cyan-500/40 hover:text-cyan-300"
              >
                <Icon name="doc" className="h-4 w-4 text-cyan-400" />
                <span className="flex-1 truncate">{a.fileName}</span>
                <span className="text-xs text-slate-500">צפייה ←</span>
              </a>
            ))}
            {t.assets.length === 0 ? (
              <p className="text-xs text-slate-600">אין קבצים מצורפים.</p>
            ) : null}
          </div>
          <textarea
            value={notes[t.id] ?? ""}
            onChange={(e) => setNotes((p) => ({ ...p, [t.id]: e.target.value }))}
            rows={2}
            placeholder="הערות / בקשת תיקונים (חובה אם מבקשים שינויים)…"
            className="mb-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200"
          />

          {/* צירוף צילום מסך / דוגמה עם הוראות תיקון */}
          {(attach[t.id]?.length ?? 0) > 0 ? (
            <div className="mb-2 flex flex-col gap-1">
              {attach[t.id].map((a, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-200"
                >
                  <Icon name="doc" className="h-4 w-4 text-orange-400" />
                  <span className="flex-1 truncate">{a.fileName}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttach((p) => ({ ...p, [t.id]: p[t.id].filter((_, j) => j !== i) }))
                    }
                    className="text-slate-600 hover:text-rose-400"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <label className="mb-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-cyan-500/40 hover:text-cyan-300">
            <Icon name="upload" className="h-4 w-4" />
            {upId === t.id ? "מעלה…" : "צירוף צילום מסך / דוגמה"}
            <input
              type="file"
              multiple
              className="hidden"
              disabled={upId === t.id}
              onChange={(e) => e.target.files?.length && uploadAttach(t.id, e.target.files)}
            />
          </label>

          <div className="flex gap-2">
            <Button disabled={busy === t.id} onClick={() => decide(t.id, "approved")}>
              <Icon name="check" className="h-4 w-4" />
              מאשר/ת ✓
            </Button>
            <Button variant="ghost" disabled={busy === t.id} onClick={() => decide(t.id, "changes")}>
              בקשת תיקונים
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
