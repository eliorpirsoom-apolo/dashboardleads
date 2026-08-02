import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

// First-run setup screen — creates the agency's first admin account.
// Once any user exists this page permanently redirects to /login.
export default async function SetupPage() {
  const users = await prisma.user.count();
  if (users > 0) redirect("/login");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-xl font-black text-white shadow-lg shadow-cyan-500/30">
            C
          </div>
          <h1 className="text-2xl font-bold text-slate-800">
            ברוכים הבאים 👋
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            הגדרה ראשונית: יצירת חשבון מנהל המשרד
          </p>
        </div>
        <div className="glass rounded-2xl p-6">
          <SetupForm />
        </div>
      </div>
    </main>
  );
}
