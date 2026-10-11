import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import styles from "./Toast.module.css";

export interface ToastEntry {
  readonly id: number;
  readonly message: string;
}

export interface ToastHandle {
  show(message: string, durationMs?: number): void;
}

const ToastContext = createContext<ToastHandle | null>(null);

const DEFAULT_DURATION_MS = 4000;

/** Mount once near the root (see App.tsx). Any feature calls `useToast().show("...")` -- no per-slice
 * wiring needed, this is the one host every toast renders through. */
export function ToastProvider({ children }: { readonly children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, durationMs = DEFAULT_DURATION_MS) => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), durationMs);
  }, []);

  const handle = useMemo<ToastHandle>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={handle}>
      {children}
      {createPortal(
        <div className={styles["hb-toast-host"]} role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={styles["hb-toast"]}>
              {toast.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastHandle {
  const handle = useContext(ToastContext);
  if (handle == null) throw new Error("useToast() called outside <ToastProvider>");
  return handle;
}
