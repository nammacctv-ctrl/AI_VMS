"use client";
import { useEffect, useRef, type ReactNode } from "react";

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", processing: "Processing", completed: "Completed", failed: "Failed (refunded)",
};
const STATUS_ICON: Record<string, string> = { pending: "○", processing: "◐", completed: "✓", failed: "✕" };

/** Status is always icon + text, never colour alone. */
export function StatusChip({ status }: { status: string }) {
  return <span className={`chip ${status}`}><span aria-hidden>{STATUS_ICON[status] ?? "•"}</span>{STATUS_LABEL[status] ?? status}</span>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: ReactNode }) {
  return <div className={`alert ${kind}`} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Loading() {
  return <div aria-busy="true" aria-label="Loading"><div className="skeleton" style={{ width: "60%" }} /><div className="skeleton" /><div className="skeleton" style={{ width: "80%" }} /></div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

/** Native <dialog>: focus trapping and Esc handling come from the browser. */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="modal-title">
      <h2 id="modal-title" style={{ marginTop: 0 }}>{title}</h2>
      {open && children}
    </dialog>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button type="button" className="btn secondary small" onClick={() => navigator.clipboard?.writeText(text)} aria-label={`${label} ${text.slice(0, 20)}`}>
      {label}
    </button>
  );
}
