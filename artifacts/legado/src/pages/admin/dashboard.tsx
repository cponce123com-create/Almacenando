import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAdminReports, useAdminUsers, useSuspendUser, useActivateUser } from "@/hooks/use-admin";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { 
  Loader2, ShieldAlert, ArrowRight, LogOut, Users, 
  HeartPulse, CheckCircle2, XCircle, Clock, 
  Archive, UserCheck, UserX, AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ADMIN_TOKEN_KEY = "legado_admin_token";

type Tab = "usuarios" | "liberaciones";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    active:       { label: "Activo",      className: "bg-green-100 text-green-700" },
    suspended:    { label: "Suspendido",  className: "bg-red-100 text-red-700" },
    pending:      { label: "Pendiente",   className: "bg-yellow-100 text-yellow-700" },
    admin_review: { label: "En revisión", className: "bg-amber-100 text-amber-700" },
    released:     { label: "Liberado",    className: "bg-blue-100 text-blue-700" },
    rejected:     { label: "Rechazado",   className: "bg-red-100 text-red-700" },
    confirmed:    { label: "Confirmado",  className: "bg-green-100 text-green-700" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-zinc-100 text-zinc-600" };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("usuarios");
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  const [suspendTarget, setSuspendTarget] = useState<{ id: string; email: string } | null>(null);

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useAdminUsers();
  const { data: reports, isLoading: reportsLoading } = useAdminReports();
  const suspendMutation = useSuspendUser();
  const activateMutation = useActivateUser();

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setLocation("/admin/login");
  };

  const handleSuspend = (userId: string, email: string) => {
    setSuspendTarget({ id: userId, email });
  };

  const confirmSuspend = async () => {
    if (!suspendTarget) return;
    try {
      await suspendMutation.mutateAsync(suspendTarget.id);
      toast({ title: "Cuenta suspendida" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setSuspendTarget(null);
    }
  };

  const handleActivate = async (userId: string, email: string) => {
    try {
      await activateMutation.mutateAsync(userId);
      toast({ title: "Cuenta reactivada" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const pendingReleases = reports?.filter(r =>
    r.status === "admin_review" ||
    (r.status === "pending" && r.confirmationsCount > 0)
  ).length ?? 0;
  const totalUsers = users?.length ?? 0;
  const activeUsers = users?.filter(u => u.status === "active").length ?? 0;

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col">
      {/* Top bar */}
      <header className="bg-white border-b border-zinc-200 px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="font-bold text-zinc-900 leading-none">Panel de Administración</h1>
            <p className="text-xs text-zinc-400 mt-0.5">Legado — acceso restringido</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="text-zinc-500 hover:text-rose-600 gap-2" onClick={handleLogout}>
          <LogOut className="w-4 h-4" />
          Cerrar sesión
        </Button>
      </header>

      <div className="flex-1 max-w-7xl mx-auto w-full px-4 md:px-8 py-8 space-y-6">
        {/* Stats summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Card className="border-none shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-violet-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{totalUsers}</p>
                <p className="text-xs text-zinc-500">Usuarios registrados</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{activeUsers}</p>
                <p className="text-xs text-zinc-500">Cuentas activas</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm col-span-2 md:col-span-1">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${pendingReleases > 0 ? 'bg-amber-100' : 'bg-zinc-100'}`}>
                <AlertTriangle className={`w-5 h-5 ${pendingReleases > 0 ? 'text-amber-600' : 'text-zinc-400'}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-900">{pendingReleases}</p>
                <p className="text-xs text-zinc-500">Liberaciones pendientes</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab("usuarios")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "usuarios" 
                ? "bg-white text-zinc-900 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <Users className="w-4 h-4" />
            Cuentas de usuarios
          </button>
          <button
            onClick={() => setTab("liberaciones")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "liberaciones" 
                ? "bg-white text-zinc-900 shadow-sm" 
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <HeartPulse className="w-4 h-4" />
            Liberación de datos
            {pendingReleases > 0 && (
              <span className="bg-rose-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {pendingReleases}
              </span>
            )}
          </button>
        </div>

        {/* USUARIOS TAB */}
        {tab === "usuarios" && (
          <Card className="border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="flex justify-center p-16"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-zinc-50 border-b border-zinc-100">
                      <tr>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Usuario</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Estado</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-center">Mensajes</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-center">Destinatarios</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-center">Contactos</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Legado</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Registro</th>
                        <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50 bg-white">
                      {users?.map(u => (
                        <tr key={u.id} className="hover:bg-zinc-50 transition-colors">
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 font-bold text-sm shrink-0">
                                {(u.fullName ?? u.email).charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium text-zinc-900 text-sm">{u.fullName ?? "—"}</p>
                                <p className="text-xs text-zinc-400">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge status={u.status} />
                          </td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <Archive className="w-3.5 h-3.5 text-zinc-400" />
                              <span className="font-semibold text-zinc-800">{u.legacyItemsCount}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-semibold text-zinc-800">{u.recipientsCount}</span>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-semibold text-zinc-800">{u.trustedContactsCount}</span>
                          </td>
                          <td className="px-5 py-4">
                            {u.deathReportStatus ? (
                              <StatusBadge status={u.deathReportStatus} />
                            ) : (
                              <span className="text-xs text-zinc-300">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs text-zinc-400">
                            {format(new Date(u.createdAt), "dd MMM yyyy", { locale: es })}
                          </td>
                          <td className="px-5 py-4">
                            {u.status === "active" ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 gap-1.5 h-8"
                                onClick={() => handleSuspend(u.id, u.email)}
                                disabled={suspendMutation.isPending}
                              >
                                <UserX className="w-3.5 h-3.5" />
                                Suspender
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs text-green-600 hover:text-green-800 hover:bg-green-50 gap-1.5 h-8"
                                onClick={() => handleActivate(u.id, u.email)}
                                disabled={activateMutation.isPending}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                Reactivar
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {users?.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-5 py-12 text-center text-zinc-400 text-sm">
                            No hay usuarios registrados aún.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* LIBERACIONES TAB */}
        {tab === "liberaciones" && (
          <div className="space-y-4">
            {pendingReleases > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800 text-sm">
                    {pendingReleases} reporte{pendingReleases > 1 ? "s" : ""} pendiente{pendingReleases > 1 ? "s" : ""} de revisión
                  </p>
                  <p className="text-amber-700 text-xs mt-0.5">
                    Estos reportes han sido confirmados por los contactos de confianza y requieren tu aprobación final para liberar los mensajes.
                  </p>
                </div>
              </div>
            )}

            <Card className="border-none shadow-sm overflow-hidden">
              <CardContent className="p-0">
                {reportsLoading ? (
                  <div className="flex justify-center p-16"><Loader2 className="w-7 h-7 animate-spin text-zinc-400" /></div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-zinc-50 border-b border-zinc-100">
                        <tr>
                          <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Usuario</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Estado del reporte</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide text-center">Confirmaciones</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Fecha</th>
                          <th className="px-5 py-3.5 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-50 bg-white">
                        {reports?.map(r => (
                          <tr key={r.id} className="hover:bg-zinc-50 transition-colors">
                            <td className="px-5 py-4">
                              <p className="font-medium text-zinc-900 text-sm">{r.userName ?? "—"}</p>
                              <p className="text-xs text-zinc-400">{r.userEmail}</p>
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={r.status} />
                            </td>
                            <td className="px-5 py-4 text-center">
                              <span className="font-semibold text-zinc-800">{r.confirmationsCount}</span>
                            </td>
                            <td className="px-5 py-4 text-xs text-zinc-400">
                              {format(new Date(r.createdAt), "dd MMM yyyy", { locale: es })}
                            </td>
                            <td className="px-5 py-4">
                              <Link href={`/admin/death-reports/${r.id}`}>
                                <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs">
                                  Ver detalles
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </Button>
                              </Link>
                            </td>
                          </tr>
                        ))}
                        {reports?.length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-5 py-12 text-center text-zinc-400 text-sm">
                              No hay reportes de fallecimiento registrados.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Suspend confirmation dialog */}
      <AlertDialog open={!!suspendTarget} onOpenChange={(open) => { if (!open) setSuspendTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Suspender esta cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a suspender la cuenta de <strong>{suspendTarget?.email}</strong>.
              El usuario no podrá iniciar sesión mientras esté suspendido,
              pero sus datos se conservarán y podrás reactivar la cuenta en cualquier momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSuspend}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Suspender cuenta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
