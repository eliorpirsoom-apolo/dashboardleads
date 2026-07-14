import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { googleEnabled } from "@/lib/google";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  no_account: "החשבון לא קיים במערכת. פנו למנהל המשרד כדי לקבל גישה.",
  google_disabled: "התחברות עם Google אינה מופעלת עדיין.",
  google_state: "ההתחברות עם Google נכשלה (אימות state). נסו שוב.",
  google_error: "ההתחברות עם Google נכשלה. נסו שוב.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await getSession();
  if (user) redirect("/");

  const errorMsg = searchParams.error ? ERRORS[searchParams.error] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-xl font-black text-white shadow-lg shadow-cyan-500/30">
            C
          </div>
          <h1 className="text-2xl font-bold text-slate-100">
            מערכת <span className="text-gradient">CRM</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            התחברות לניהול הפעילות הדיגיטלית שלך
          </p>
        </div>
        <div className="glass rounded-2xl p-6">
          <LoginForm
            googleEnabled={googleEnabled()}
            initialError={errorMsg}
          />
        </div>
      </div>
    </main>
  );
}
