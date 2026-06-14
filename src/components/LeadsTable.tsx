"use client";

import { useEffect, useState } from "react";
import {
  Card,
  Title,
  Text,
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
    <Card>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title>Leads</Title>
          <Text className="text-slate-400">
            {data ? `${data.total.toLocaleString()} leads` : "Loading…"}
          </Text>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
          className="flex w-full gap-2 sm:w-auto"
        >
          <TextInput
            placeholder="Search id, status, source, campaign…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="sm:w-72"
          />
          <Button type="submit" variant="secondary" loading={loading}>
            Search
          </Button>
        </form>
      </div>

      <div className="thin-scroll mt-4 overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Lead ID</TableHeaderCell>
              <TableHeaderCell>Campaign</TableHeaderCell>
              <TableHeaderCell>Date / Time</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Source</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.leads.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell className="font-mono text-xs">
                  {lead.externalId}
                </TableCell>
                <TableCell>{lead.campaign}</TableCell>
                <TableCell>{formatDateTime(lead.receivedAt)}</TableCell>
                <TableCell>
                  <Badge color={statusColor(lead.status)} size="xs">
                    {lead.status}
                  </Badge>
                </TableCell>
                <TableCell>{lead.source}</TableCell>
              </TableRow>
            ))}
            {data && data.leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={5}>
                  <Text className="py-6 text-center text-slate-400">
                    No leads match the current filters.
                  </Text>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <Text className="text-sm text-slate-500">
            Page {data.page} of {data.totalPages}
          </Text>
          <div className="flex gap-2">
            <Button
              size="xs"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              size="xs"
              variant="secondary"
              disabled={page >= data.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
