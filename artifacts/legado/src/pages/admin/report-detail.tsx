import { useState } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useAdminReport, useApproveRelease, useRejectRelease, useDeleteReport } from "@/hooks/use-admin";
import { getAdminAuthHeaders } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Loader2, ArrowLeft, CheckCircle, XCircle, Unlock,
  Clock, Ban, ShieldCheck, AlertTriangle, Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  pending:      { label: "Pendiente de confirmaciones", className: "bg-amber-100 text-amber-800",  icon: <Clock className="w-4 h-4" /> },
  admin_review: { label: "En revisión",                  className: "bg-orange-100 text-orange-800", icon: <AlertTriangle className="w-4 h-4" /> },
  released:     { label: "Legado liberado",              className: "bg-green-100 text-green-800",  icon: <Unlock className="w-4 h-4" /> },
  rejected:     { label: "Rechazado",                    className: "bg-red-100 text-red-800",      icon: <Ban className="w-4 h-4" /> },
};

export default function AdminReportDetail() {
  const [, params] = useRoute("/admin/death-reports/:id");
  const id = params?.id || "";
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: report, isLoading } = useAdminReport(id);
  const approveMutation = useApproveRelease();
  const rejectMutation = useRejectRelease();
  const deleteMutation = useDeleteReport();

  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showForceApproveDialog, setShowForceApproveDialog] = useState(false);
  const [forceApproveError, setForceApproveError] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const doApprove = async (force = false) => {
    const headers = getAdminAuthHeaders() as Record<string, string>;
    const res = await fetch(`/api/admin/death-reports/${id}/approve`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(force ? { force: true } : {}),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && (data as any).canForce) {
        setForceApproveError((data as any).error ?? "");
        setShowApproveDialog(false);
        setShowForceApproveDialog(true);
        return false;
      }
      throw new Error((data as any).error || "Error al aprobar");
    }
    approveMutation.reset();
    return true;
  };

  const handleApproveConfirm = async () => {
    setIsApproving(true);
    try {
      const ok = await doApprove(false);
      if (ok) {
        setShowApproveDialog(false);
        toast({ title: "Legado liberado", description: "Los destinatarios han recibido sus enlaces de acceso." });
        setLocation("/admin");
      }
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
      setShowApproveDialog(false);
    } finally {
      setIsApproving(false);
    }
  };

  const handleForceApproveConfirm = async () => {
    setIsApproving(true);
    try {
      await doApprove(true);
      setShowForceApproveDialog(false);
      toast({ title: "Legado liberado", description: "Los destinatarios han recibido sus enlaces de acceso." });
      setLocation("/admin");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
      setShowForceApproveDialog(false);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectConfirm = async () => {
    setIsRejecting(true);
    try {
      await rejectMutation.mutateAsync({ id, data: { reason: rejectReason.trim() || undefined } });
      setShowRejectDialog(false);
      setRejectReason("");
      toast({ title: "Reporte rechazado" });
      setLocation("/admin");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(id);
      setShowDeleteDialog(false);
      toast({ title: "Reporte eliminado" });
      setLocation("/admin");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    );
  }
  if (!report) return <div className="p-12 text-center text-zinc-500">Reporte no encontrado</div>;

  const statusCfg = STATUS_CONFIG[report.status] ?? { label: report.status, className: "bg-zinc-100 text-zinc-700", icon: null };
  const canAct = report.status !== "released" && report.status !== "rejected";
  const isAutoReleased = report.status === "released";

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex items-center gap-4 sticky top-0 z-20">
        <Link href="/admin" className="text-zinc-400 hover:text-zinc-700 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-bold text-zinc-900 leading-none">Reporte de fallecimiento</h1>
          <p className="text-xs text-zinc-400 mt-0.5">{report.userEmail}</p>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 space-y-5">

        {/* Status banner */}
        <div className={`flex items-center gap-3 rounded-xl px-4 py-3 ${statusCfg.className}`}>
          {statusCfg.icon}
          <div>
            <p className="font-semibold text-sm">{statusCfg.label}</p>
            {isAutoReleased && (
              <p className="text-xs mt-0.5 opacity-80">El legado fue liberado automáticamente al confirmarse todos los contactos</p>
            )}
          </div>
        </div>

        {/* General info */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Información general</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Usuario</p>
                <p className="font-medium text-zinc-900">{report.userName ?? "—"}</p>
                <p className="text-xs text-zinc-400">{report.userEmail}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400 mb-0.5">Fecha del reporte</p>
                <p className="font-medium text-zinc-900">
                  {format(new Date(report.createdAt), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}
                </p>
              </div>
              {report.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-zinc-400 mb-0.5">Notas del reportante</p>
                  <p className="text-zinc-700 bg-zinc-50 rounded-lg p-3 text-sm">"{report.notes}"</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confirmations */}
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Confirmaciones de contactos
              <span className="text-sm font-normal text-zinc-400">
                {report.confirmations.length} confirmación{report.confirmations.length !== 1 ? "es" : ""}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.confirmations.length === 0 ? (
              <div className="text-center py-6 text-zinc-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">Ningún contacto ha confirmado aún</p>
              </div>
            ) : (
              <div className="space-y-3">
                {report.confirmations.map(conf => (
                  <div key={conf.id} className="flex items-start gap-3 p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      conf.decision === "confirmed" ? "bg-green-100" : "bg-red-100"
                    }`}>
                      {conf.decision === "confirmed"
                        ? <CheckCircle className="w-4 h-4 text-green-600" />
                        : <XCircle className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-zinc-900 text-sm">{conf.trustedContactName}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          conf.decision === "confirmed"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}>
                          {conf.decision === "confirmed" ? "Confirmado" : "Rechazado"}
                        </span>
                      </div>
                      {conf.confirmedAt && (
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {format(new Date(conf.confirmedAt), "dd MMM yyyy, HH:mm", { locale: es })}
                        </p>
                      )}
                      {conf.comments && (
                        <p className="text-sm text-zinc-600 mt-2 bg-white rounded-lg p-2 border border-zinc-100 italic">
                          "{conf.comments}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Admin action */}
        {canAct && (
          <Card className="border-2 border-violet-200 shadow-md">
            <CardContent className="p-6">
              <div className="flex items-start gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Decisión del administrador</h3>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {report.confirmations.length >= 2
                      ? "Todos los contactos han confirmado. Puedes liberar el legado manualmente."
                      : `${report.confirmations.length} de los contactos ha confirmado. Puedes liberar el legado de forma anticipada o esperar.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isRejecting || isApproving}
                >
                  <XCircle className="w-4 h-4" />
                  Rechazar reporte
                </Button>
                <Button
                  className="gap-2 bg-violet-600 hover:bg-violet-700 text-white flex-1 sm:flex-none"
                  onClick={() => setShowApproveDialog(true)}
                  disabled={isApproving || isRejecting}
                >
                  {isApproving
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Unlock className="w-4 h-4" />}
                  Aprobar y liberar legado
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Already released info */}
        {report.status === "released" && (
          <Card className="border-green-200 shadow-sm">
            <CardContent className="p-5 flex items-start gap-3">
              <Unlock className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-green-800 text-sm">Legado liberado</p>
                <p className="text-green-700 text-xs mt-1">
                  Los destinatarios ya recibieron sus enlaces de acceso personales por correo electrónico.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rejected info */}
        {report.status === "rejected" && (
          <Card className="border-red-200 shadow-sm">
            <CardContent className="p-5 flex items-start gap-3">
              <Ban className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-800 text-sm">Reporte rechazado</p>
                <p className="text-red-700 text-xs mt-1">Este reporte fue marcado como inválido y no se liberará el legado.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Danger zone */}
        <Card className="border-zinc-200 shadow-sm">
          <CardContent className="p-5 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-zinc-700">Zona de peligro</p>
              <p className="text-xs text-zinc-400 mt-0.5">Elimina este reporte (útil para pruebas). No puede deshacerse.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300"
              onClick={() => setShowDeleteDialog(true)}
              disabled={isDeleting}
            >
              {isDeleting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Trash2 className="w-4 h-4" />}
              Eliminar reporte
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Approve dialog ── */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Liberar este legado?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción es irreversible. El legado será entregado a todos los destinatarios registrados y recibirán un enlace de acceso personal por correo electrónico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApproveConfirm}
              disabled={isApproving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isApproving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sí, liberar legado
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Force approve dialog (when confirmations < minimum) ── */}
      <AlertDialog open={showForceApproveDialog} onOpenChange={setShowForceApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Aprobación forzada
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="text-amber-700 font-medium mb-2">{forceApproveError}</p>
                <p>¿Deseas aprobar de todas formas como administrador? Esta acción es irreversible.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isApproving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceApproveConfirm}
              disabled={isApproving}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isApproving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Aprobar de todas formas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Reject dialog ── */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Rechazar reporte</DialogTitle>
            <DialogDescription>
              Indica la razón por la que este reporte no es válido. Esta información puede quedar registrada en el historial.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Razón del rechazo (opcional)…"
              className="resize-none rounded-xl min-h-[100px]"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)} disabled={isRejecting}>
              Cancelar
            </Button>
            <Button
              onClick={handleRejectConfirm}
              disabled={isRejecting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isRejecting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ── */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este reporte?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará permanentemente el reporte de fallecimiento y todas sus confirmaciones. No se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Sí, eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
