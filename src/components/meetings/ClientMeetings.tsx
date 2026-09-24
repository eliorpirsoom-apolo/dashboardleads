"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/fetcher";
import { Card } from "@/components/ui";

interface Meeting {
  id: string;
  title: string;
  meetingDate: string;
  sentAt: string | null;
  points: string[];
}

export default function ClientMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ meetings: Meeting[] }>("/api/app/meetings")
      .then((d) => setMeetings(d.meetings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="p-8 text-center text-sm text-slate-400">טוען…</p>;
  if (meetings.length === 0) {
    return (
      <Card>
        <p className="py-10 text-center text-sm text-slate-500">אין עדיין סיכומי פגישות.</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {meetings.map((m) => (
        <Card key={m.id}>
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-800">{m.title}</h3>
            <span className="text-xs text-slate-400">
              {new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(m.meetingDate))}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {m.points.map((p, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-[#3a5bd9]">•</span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}
