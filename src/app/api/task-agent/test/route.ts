import { NextResponse } from "next/server";
import { z } from "zod";
import { handle, requireAdmin, readJson } from "@/lib/api";
import { extractTasks, getTaskAgentConfig } from "@/lib/taskAgent";
import { aiConfigured } from "@/lib/ai";

export const dynamic = "force-dynamic";

const TestBody = z.object({
  text: z.string().min(1, "טקסט ריק").max(4000),
  instructions: z.string().max(2000).nullable().optional(),
});

// POST /api/task-agent/test — תצוגה מקדימה של חילוץ משימות מטקסט (ללא שמירה).
export const POST = handle(async (req) => {
  await requireAdmin();
  const b = TestBody.parse(await readJson(req));
  const cfg = await getTaskAgentConfig();
  // אם נשלחו הנחיות בבדיקה — משתמשים בהן; אחרת בהנחיות השמורות.
  const instructions = b.instructions !== undefined ? b.instructions : cfg.instructions;
  const tasks = await extractTasks(b.text, instructions, cfg.model);
  return NextResponse.json({ tasks, aiReady: aiConfigured() });
});
