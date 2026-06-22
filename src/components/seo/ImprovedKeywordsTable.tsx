"use client";

import type { ImprovedKeyword } from "@/lib/seoTypes";
import { formatNumber } from "@/lib/format";

export default function ImprovedKeywordsTable({
  keywords,
}: {
  keywords: ImprovedKeyword[];
}) {
  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <span className="text-lg">🚀</span>
        <h3 className="text-lg font-semibold text-slate-100">
          ביטויים שעלינו בהם לאחרונה
        </h3>
      </div>
      <p className="mt-0.5 text-sm text-slate-400">
        ביטויים שטיפסו במיקום הממוצע בגוגל מול 60 הימים הקודמים
      </p>

      {keywords.length === 0 ? (
        <p className="mt-6 text-center text-sm text-slate-500">
          אין שינויי מיקום מהותיים בתקופה זו.
        </p>
      ) : (
        <div className="thin-scroll mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">ביטוי חיפוש</th>
                <th className="px-3 py-2 font-medium">מיקום קודם</th>
                <th className="px-3 py-2 font-medium">מיקום נוכחי</th>
                <th className="px-3 py-2 font-medium">שיפור</th>
                <th className="px-3 py-2 font-medium">קליקים</th>
                <th className="px-3 py-2 font-medium">חשיפות</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((k) => (
                <tr
                  key={k.query}
                  className="border-b border-white/5 transition-colors hover:bg-white/5"
                >
                  <td className="px-3 py-2.5 font-medium text-slate-100">
                    {k.query}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {k.previousPosition.toFixed(1)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold text-slate-100">
                    {k.currentPosition.toFixed(1)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-500/30">
                      ▲ {k.positionDelta.toFixed(1)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {formatNumber(k.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {formatNumber(k.impressions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
