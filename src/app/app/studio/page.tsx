import StudioApprovals from "@/components/studio/StudioApprovals";

export const dynamic = "force-dynamic";

// צד לקוח — אישור עיצובים ומתן פידבק.
export default function ClientStudioPage() {
  return (
    <div className="theme-light -mx-4 -my-6 min-h-screen px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">עיצובים לאישור</h1>
        <p className="mt-1 text-sm text-slate-500">צפייה בתוצרים, אישור או בקשת תיקונים</p>
      </div>
      <StudioApprovals />
    </div>
  );
}
