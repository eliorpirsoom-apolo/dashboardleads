import GanttBoard from "@/components/gantt/GanttBoard";

export const dynamic = "force-dynamic";

export default function AdminClientGanttPage({
  params,
}: {
  params: { id: string };
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-100">גאנט — תוכנית עבודה</h2>
        <p className="text-xs text-slate-500">
          תכנון שבועי ל-6 חודשים. הלקוח רואה את התוכנית וההתקדמות מהאזור שלו.
        </p>
      </div>
      <GanttBoard clientId={params.id} canEdit />
    </div>
  );
}
