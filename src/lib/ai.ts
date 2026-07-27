// ---------------------------------------------------------------------------
// עוזר AI כללי (OpenAI chat) לשימוש חוזר — ברכות, סיכומים, ניסוחים.
// מדלג/זורק אם אין מפתח. משתף את OPENAI_API_KEY עם מנוע התמלול.
// ---------------------------------------------------------------------------

const OPENAI_BASE = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function aiComplete(opts: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}): Promise<string> {
  if (!aiConfigured()) throw new Error("OpenAI לא מוגדר");
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model || process.env.OPENAI_SUMMARY_MODEL || "gpt-4o-mini",
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 400,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text).choices?.[0]?.message?.content?.trim() ?? "";
  } catch {
    return "";
  }
}
