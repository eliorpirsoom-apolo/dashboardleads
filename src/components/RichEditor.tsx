"use client";

import { useEffect, useRef } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Icon } from "@/components/Icon";

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
}: {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  uploadImage?: (file: File) => Promise<string | null>;
  resetSignal?: number;
  minHeight?: number;
}) {
  const uploadRef = useRef(uploadImage);
  uploadRef.current = uploadImage;
  const fileRef = useRef<HTMLInputElement>(null);

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
    onUpdate: ({ editor }) => onChange?.(editor.getHTML()),
    editorProps: {
      attributes: { class: "rich-content px-3 py-2", style: `min-height:${minHeight}px` },
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

  useEffect(() => {
    if (resetSignal > 0) editor?.commands.clearContent();
  }, [resetSignal, editor]);

  if (!editor) return null;

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
    </div>
  );
}
