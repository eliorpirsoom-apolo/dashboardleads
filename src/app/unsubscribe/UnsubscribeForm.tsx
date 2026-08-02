"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

export default function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    token ? "idle" : "error"
  );
  const [error, setError] = useState(token ? "" : "קישור הסרה חסר או לא תקין");

  async function unsubscribe() {
    setState("busy");
    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ t: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "שגיאה");
      setState("done");
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <>
        <p className="text-3xl">✓</p>
        <h1 className="mt-2 text-xl font-bold text-slate-800">הוסרתם מרשימת התפוצה</h1>
        <p className="mt-2 text-sm text-slate-400">
          לא תקבלו יותר הודעות שיווקיות. אפשר לסגור את החלון.
        </p>
      </>
    );
  }

  if (state === "error") {
    return (
      <>
        <h1 className="text-xl font-bold text-slate-800">שגיאה</h1>
        <p className="mt-2 text-sm text-red-600">{error}</p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold text-slate-800">הסרה מרשימת התפוצה</h1>
      <p className="mt-2 text-sm text-slate-400">
        לחיצה על הכפתור תסיר אתכם מקבלת הודעות שיווקיות נוספות.
      </p>
      <Button className="mt-5 w-full" onClick={unsubscribe} disabled={state === "busy"}>
        {state === "busy" ? "מסיר…" : "הסירו אותי מהרשימה"}
      </Button>
    </>
  );
}
