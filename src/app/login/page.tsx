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
          {/* לוגו אפולו — שחור על שקוף, מהופך ללבן על הרקע הכהה. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/apollo-logo.png"
            alt="Apollo"
            className="mx-auto mb-4 h-9 w-auto invert"
          />
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
