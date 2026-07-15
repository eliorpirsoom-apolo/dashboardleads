"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./Icon";

// ---------------------------------------------------------------------------
// הודעות מערכת אחידות (toast) + דיאלוג אישור מעוצב — מחליפים את
// alert()/confirm() של הדפדפן בכל המערכת.
// ---------------------------------------------------------------------------

interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

interface ConfirmState {
  text: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}

interface ToasterApi {
  toast: (text: string, kind?: Toast["kind"]) => void;
  confirmDialog: (text: string, opts?: { danger?: boolean }) => Promise<boolean>;
}

const ToasterContext = createContext<ToasterApi>({
  toast: (text) => alert(text),
  confirmDialog: async (text) => confirm(text),
});

export function useToaster(): ToasterApi {
  return useContext(ToasterContext);
}

export default function ToasterProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const idRef = useRef(0);

  const toast = useCallback((text: string, kind: Toast["kind"] = "success") => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, kind, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const confirmDialog = useCallback(
    (text: string, opts?: { danger?: boolean }) =>
      new Promise<boolean>((resolve) => {
        setConfirmState({ text, danger: opts?.danger, resolve });
      }),
    []
  );

  // Global shim: every alert() in the app becomes a styled toast.
  // (confirm() stays native — it must return synchronously.)
  useEffect(() => {
    const original = window.alert;
    window.alert = (msg?: any) => {
      const text = String(msg ?? "");
      const kind: Toast["kind"] = /✓|נשלח|נוצר|הועתק|בוצע/.test(text)
        ? "success"
        : /שגיא|נכשל|לא ניתן|אי אפשר|חסר|יותר מדי/.test(text)
          ? "error"
          : "info";
      toast(text, kind);
    };
    return () => {
      window.alert = original;
    };
  }, [toast]);

  function answer(ok: boolean) {
    confirmState?.resolve(ok);
    setConfirmState(null);
  }

  const KIND_STYLE: Record<Toast["kind"], string> = {
    success: "border-emerald-700/60 bg-emerald-950/90 text-emerald-200",
    error: "border-red-700/60 bg-red-950/90 text-red-200",
    info: "border-cyan-700/60 bg-cyan-950/90 text-cyan-200",
  };

  return (
    <ToasterContext.Provider value={{ toast, confirmDialog }}>
      {children}

      {/* Toasts */}
      <div className="pointer-events-none fixed bottom-4 left-4 z-[100] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur ${KIND_STYLE[t.kind]}`}
          >
            <Icon
              name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "note"}
              className="h-4 w-4"
            />
            {t.text}
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => answer(false)} />
          <div className="glass relative w-full max-w-sm rounded-2xl p-5">
            <p className="text-sm leading-relaxed text-slate-200">{confirmState.text}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => answer(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:border-slate-500"
              >
                ביטול
              </button>
              <button
                onClick={() => answer(true)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  confirmState.danger
                    ? "border border-red-800/60 bg-red-950/60 text-red-200 hover:border-red-500"
                    : "btn-neon"
                }`}
              >
                אישור
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ToasterContext.Provider>
  );
}
