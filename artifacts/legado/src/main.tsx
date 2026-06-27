import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// ── Global error handlers ─────────────────────────────────────────────────────
// These catch errors that React ErrorBoundary cannot: async promise rejections,
// unhandled runtime errors in event handlers, third-party script errors, etc.
// Without these, the app could silently break or show a blank white screen.

window.onerror = (
  _event: string | Event,
  _source?: string,
  _lineno?: number,
  _colno?: number,
  error?: Error | null,
) => {
  console.error("[Global] Uncaught error:", error?.message ?? _event);
  // Show a toast when possible (the UI may still be functional)
  const detail = error?.message ?? String(_event);
  window.dispatchEvent(
    new CustomEvent("app:error", { detail: `Error inesperado: ${detail}` }),
  );
  // Prevent default browser error handler from showing its own dialog
  return true;
};

window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
  const reason = event.reason;
  const message =
    reason instanceof Error ? reason.message : String(reason ?? "Error desconocido");
  console.error("[Global] Unhandled promise rejection:", message);
  window.dispatchEvent(
    new CustomEvent("app:error", { detail: `Error inesperado: ${message}` }),
  );
  event.preventDefault();
});

const root = document.getElementById("root")!;
createRoot(root).render(<App />);
