"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Icon } from "@/components/Icon";

export interface MentionUser {
  id: string;
  name: string;
}

// נגן וידאו מוטבע — <video controls> שנשמר ומוצג גם בתצוגת ההודעות.
const Video = Node.create({
  name: "video",
  group: "block",
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{ tag: "video" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["video", { ...HTMLAttributes, controls: "true", class: "rounded-lg max-w-full", preload: "metadata" }];
  },
});

// עורך טקסט עשיר (Tiptap) — טקסט מעוצב + תמונות/סרטונים מוטבעים (העלאה/הדבקה/גרירה) + קישורים.
export default function RichEditor({
  value = "",
  onChange,
  placeholder = "כתבו כאן…",
  uploadImage,
  resetSignal = 0,
  minHeight = 120,
  mentionUsers,
  onMention,
}: {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  uploadImage?: (file: File) => Promise<string | null>;
  resetSignal?: number;
  minHeight?: number;
  // תיוג @ (כמו במאנדיי): רשימת משתמשים לתפריט; onMention נקרא בבחירה.
  mentionUsers?: MentionUser[];
  onMention?: (u: MentionUser) => void;
}) {
  const uploadRef = useRef(uploadImage);
  uploadRef.current = uploadImage;
  const fileRef = useRef<HTMLInputElement>(null);

  // --- תיוג @: מצב התפריט. refs במקביל ל-state כי handleKeyDown נסגר פעם אחת. ---
  const [mention, setMention] = useState<{ query: string; top: number; left: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const mentionRef = useRef<{ query: string } | null>(null);
  const mentionIdxRef = useRef(0);
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;
  const onMentionRef = useRef(onMention);
  onMentionRef.current = onMention;
  const editorRef = useRef<Editor | null>(null);

  const filteredMentions = (query: string): MentionUser[] =>
    (mentionUsersRef.current || [])
      .filter((u) => u.name.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 6);

  // זיהוי "@טקסט" לפני הסמן → פתיחת התפריט ליד הסמן.
  function detectMention(ed: Editor) {
    if (!mentionUsersRef.current?.length) return;
    const { $from, empty } = ed.state.selection;
    if (!empty || !$from.parent.isTextblock) {
      mentionRef.current = null;
      setMention(null);
      return;
    }
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "￼");
    const m = before.match(/(?:^|\s)@([^@\s]{0,30})$/);
    if (!m) {
      mentionRef.current = null;
      setMention(null);
      return;
    }
    const query = m[1];
    const coords = ed.view.coordsAtPos(ed.state.selection.from);
    mentionRef.current = { query };
    mentionIdxRef.current = 0;
    setMentionIdx(0);
    setMention({ query, top: coords.bottom + 4, left: coords.left });
  }

  // בחירת משתמש: מחיקת "@query" והוספת "@שם" מודגש + רווח רגיל.
  function pickMention(u: MentionUser) {
    const ed = editorRef.current;
    const st = mentionRef.current;
    if (!ed || !st) return;
    const from = ed.state.selection.from;
    ed.chain()
      .focus()
      .deleteRange({ from: from - (st.query.length + 1), to: from })
      .insertContent([
        { type: "text", marks: [{ type: "bold" }], text: `@${u.name}` },
        { type: "text", text: " " },
      ])
      .run();
    mentionRef.current = null;
    setMention(null);
    onMentionRef.current?.(u);
  }

  // העלאת מדיה והטבעה: תמונה → <img>, וידאו → <video>, קובץ אחר → קישור להורדה.
  async function insertMedia(ed: Editor, file: File) {
    const up = uploadRef.current;
    if (!up) return;
    try {
      const url = await up(file);
      if (!url) return;
      if (file.type.startsWith("video/")) {
        ed.chain().focus().insertContent({ type: "video", attrs: { src: url } }).run();
      } else if (file.type.startsWith("image/")) {
        ed.chain().focus().setImage({ src: url }).run();
      } else {
        ed.chain().focus().insertContent(
          `<a href="${url}" target="_blank" rel="noopener">📎 ${file.name}</a> `
        ).run();
      }
    } catch (e: any) {
      alert(e?.message || "העלאת הקובץ נכשלה");
    }
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: true } }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      Video,
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML());
      detectMention(editor);
    },
    onSelectionUpdate: ({ editor }) => detectMention(editor),
    editorProps: {
      attributes: { class: "rich-content px-3 py-2", style: `min-height:${minHeight}px` },
      handleKeyDown: (_view, event) => {
        const st = mentionRef.current;
        if (!st) return false;
        const list = filteredMentions(st.query);
        if (list.length === 0) return false;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          const dir = event.key === "ArrowDown" ? 1 : -1;
          mentionIdxRef.current = (mentionIdxRef.current + dir + list.length) % list.length;
          setMentionIdx(mentionIdxRef.current);
          return true;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          pickMention(list[mentionIdxRef.current] || list[0]);
          return true;
        }
        if (event.key === "Escape") {
          mentionRef.current = null;
          setMention(null);
          return true;
        }
        return false;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items || !editor) return false;
        for (const it of Array.from(items)) {
          if (it.type.startsWith("image/") || it.type.startsWith("video/")) {
            const file = it.getAsFile();
            if (file) {
              event.preventDefault();
              insertMedia(editor, file);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop: (_view, event) => {
        const files = (event as DragEvent).dataTransfer?.files;
        if (
          files && files.length && editor &&
          (files[0].type.startsWith("image/") || files[0].type.startsWith("video/"))
        ) {
          event.preventDefault();
          insertMedia(editor, files[0]);
          return true;
        }
        return false;
      },
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (resetSignal > 0) editor?.commands.clearContent();
  }, [resetSignal, editor]);

  if (!editor) return null;

  const mentionList = mention ? filteredMentions(mention.query) : [];

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-sm leading-none transition ${
      active ? "bg-[#3a5bd9]/15 text-[#3a5bd9]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
    }`;

  function addLink() {
    if (!editor) return;
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("כתובת קישור (URL):", prev || "https://");
    if (url === null) return;
    if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} title="מודגש"><b>B</b></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} title="נטוי"><i>I</i></button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} title="קו תחתון"><u>U</u></button>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} title="כותרת">H</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} title="רשימה">•</button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} title="רשימה ממוספרת">1.</button>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={addLink} className={btn(editor.isActive("link"))} title="קישור"><Icon name="link" className="h-4 w-4" /></button>
        {uploadImage ? (
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()} className={btn(false)} title="הוספת תמונה / סרטון"><Icon name="upload" className="h-4 w-4" /></button>
        ) : null}
      </div>
      <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) insertMedia(editor, f); e.target.value = ""; }} />
      <EditorContent editor={editor} />
      {/* תפריט תיוג @ צף ליד הסמן */}
      {mention && mentionList.length > 0 ? (
        <div
          className="fixed z-[70] min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          style={{ top: mention.top, left: mention.left }}
        >
          {mentionList.map((u, i) => (
            <button
              key={u.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); pickMention(u); }}
              onMouseEnter={() => { mentionIdxRef.current = i; setMentionIdx(i); }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-right text-sm ${i === mentionIdx ? "bg-[#3a5bd9]/10 text-[#3a5bd9]" : "text-slate-700"}`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3a5bd9]/15 text-[11px] font-bold text-[#3a5bd9]">
                {u.name.slice(0, 1)}
              </span>
              {u.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
