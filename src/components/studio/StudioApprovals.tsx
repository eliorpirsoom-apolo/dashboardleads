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

export default function StudioApprovals() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
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
        json: { decision, text: text || null },
      });
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
