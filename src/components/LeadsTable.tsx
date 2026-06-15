"use client";

import { useEffect, useState } from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  TextInput,
  Button,
} from "@tremor/react";
import type { LeadRow } from "@/lib/types";
import { formatDateTime, statusColor } from "@/lib/format";

interface LeadsResponse {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  leads: LeadRow[];
}

export default function LeadsTable({ baseQuery }: { baseQuery: string }) {
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Reset to page 1 whenever the upstream filters change.
  useEffect(() => {
    setPage(1);
  }, [baseQuery, search]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams(baseQuery);
        params.set("page", String(page));
        params.set("pageSize", "25");
        if (search) params.set("q", search);
        const res = await fetch(`/api/leads?${params.toString()}`, {
          signal: controller.signal,
        });
        if (res.ok) setData(await res.json());
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [baseQuery, page, search]);

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <div>
            <h3 className="text-lg font-semibold text-slate-100">לידים</h3>
            <p className="text-sm text-slate-400">
              {data ? `${data.total.toLocaleString("he-IL")} לידים` : "טוען…"}
            </p>
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <TextInput
            placeholder="חיפוש לפי מזהה, סטטוס, מקור, קמפיין…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:w-72"
          />
          <Button type="submit" variant="secondary" loading={loading}>
            חיפוש
          </Button>
        </form>
      </div>

      <div className="thin-scroll mt-4 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="text-slate-300">מזהה ליד</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">קמפיין</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">תאריך / שעה</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">סטטוס</TableHeaderCell>
              <TableHeaderCell className="text-slate-300">מקור</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.leads.map((lead) => (
              <TableRow key={lead.id} className="border-white/5">
                <TableCell>
                  <span className="ltr-embed inline-block font-mono text-xs text-cyan-300">
                    {lead.externalId}
                  </span>
                </TableCell>
                <TableCell className="text-slate-200">{lead.campaign}</TableCell>
                <TableCell className="text-slate-300">
                  {formatDateTime(lead.receivedAt)}
                </TableCell>
                <TableCell>
                  <Badge color={statusColor(lead.status)} size="xs">
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-300">{lead.source}</TableCell>
              </TableRow>
            ))}
            {data && data.leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <p className="py-6 text-center text-slate-500">
                    אין לידים התואמים לסינון הנוכחי.
                  </p>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            עמוד {data.page} מתוך {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              הקודם
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              הבא
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
