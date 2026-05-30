import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Bell, Loader2, CheckCheck, AlertTriangle, Info, Clock, X } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "low_stock" | "expiring_lot" | "info" | "warning";
  isRead: boolean;
  createdAt: string;
}

const TYPE_STYLES: Record<string, { dot: string; bg: string; border: string; icon: any }> = {
  low_stock: { dot: "#ef4444", bg: "#fef2f2", border: "#fecaca", icon: AlertTriangle },
  expiring_lot: { dot: "#f97316", bg: "#fff7ed", border: "#fed7aa", icon: Clock },
  info: { dot: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", icon: Info },
  warning: { dot: "#f59e0b", bg: "#fefce8", border: "#fde68a", icon: AlertTriangle },
};

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(path.startsWith("http") ? path : path, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}), "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

export function NotificationBell() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications/unread"],
    queryFn: () => fetch("/api/notifications/unread", { headers: { ...getAuthHeaders() } }).then(r => { if (!r.ok) throw new Error("Error"); return r.json(); }),
    refetchInterval: 30000,
  });

  const unreadCount = notifications.length;

  const markAllReadMutation = useMutation({
    mutationFn: () =>
      fetch("/api/notifications/mark-all-read", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      }).then(r => { if (!r.ok) throw new Error("Error"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
      toast({ title: "Notificaciones leídas", description: "Todas las notificaciones fueron marcadas como leídas." });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/notifications/${id}/read`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      }).then(r => { if (!r.ok) throw new Error("Error"); return r.json(); }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/notifications/unread"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg transition-colors hover:bg-slate-100"
        aria-label={`Notificaciones${unreadCount > 0 ? `, ${unreadCount} sin leer` : ""}`}
        style={{ color: "#64748b" }}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full"
            style={{ backgroundColor: "#ef4444", boxShadow: "0 0 0 2px #fff" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden"
          style={{ maxHeight: "480px" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-800">Notificaciones</span>
              {unreadCount > 0 && (
                <span
                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white rounded-full"
                  style={{ backgroundColor: "#ef4444" }}
                >
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1 text-xs text-emerald-600"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
              >
                {markAllReadMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCheck className="w-3.5 h-3.5" />
                )}
                Marcar todas leídas
              </Button>
            )}
          </div>

          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: "360px" }}>
            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Cargando...</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-slate-400">
                <CheckCheck className="w-8 h-8" />
                <p className="text-sm">No hay notificaciones</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map((n) => {
                  const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.info;
                  const Icon = style.icon;
                  return (
                    <div
                      key={n.id}
                      className={`px-4 py-3 transition-colors ${
                        !n.isRead ? "bg-slate-50/80" : ""
                      } hover:bg-slate-50 cursor-pointer`}
                      onClick={() => {
                        if (!n.isRead) markReadMutation.mutate(n.id);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !n.isRead) markReadMutation.mutate(n.id);
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{ backgroundColor: style.bg }}
                        >
                          <Icon className="w-4 h-4" style={{ color: style.dot }} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-800 truncate">{n.title}</p>
                            <div
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: !n.isRead ? style.dot : "transparent",
                              }}
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {new Date(n.createdAt).toLocaleString("es-PE")}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
