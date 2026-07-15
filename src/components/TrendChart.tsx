"use client";

import { AreaChart } from "@tremor/react";
import { Card } from "./ui";

// גרף מגמת לידים 30 יום — משותף לדשבורד הלקוח ולסקירת לקוח במשרד.
export default function TrendChart({
  data,
  title = "לידים ב-30 הימים האחרונים",
}: {
  data: { date: string; לידים: number }[];
  title?: string;
}) {
  const total = data.reduce((s, d) => s + d.לידים, 0);
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-100">{title}</h2>
        <span className="text-xs text-slate-500">{total} בסה״כ</span>
      </div>
      {total === 0 ? (
        <p className="py-8 text-center text-xs text-slate-600">אין לידים בתקופה</p>
      ) : (
        <AreaChart
          className="ltr-embed h-44"
          data={data}
          index="date"
          categories={["לידים"]}
          colors={["cyan"]}
          showLegend={false}
          showAnimation
        />
      )}
    </Card>
  );
}
