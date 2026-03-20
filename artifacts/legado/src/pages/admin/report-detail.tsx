import { useRoute, Link, useLocation } from "wouter";
import { useAdminReport, useApproveRelease, useRejectRelease } from "@/hooks/use-admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CheckCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function AdminReportDetail() {
  const [match, params] = useRoute("/admin/death-reports/:id");
  const id = params?.id || "";
  const [_, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { data: report, isLoading } = useAdminReport(id);
  const approveMutation = useApproveRelease();
  const rejectMutation = useRejectRelease();

  const handleApprove = async () => {
    if(confirm("¿Estás seguro de APROBAR esta liberación? Esto enviará irrevocablemente los mensajes a los destinatarios.")) {
      try {
        await approveMutation.mutateAsync({ id });
        toast({ title: "Liberación aprobada y mensajes enviados" });
        setLocation("/admin");
      } catch(e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  };

  const handleReject = async () => {
    const reason = prompt("Razón del rechazo (opcional):");
    if(reason !== null) {
      try {
        await rejectMutation.mutateAsync({ id, data: { reason } });
        toast({ title: "Reporte rechazado" });
        setLocation("/admin");
      } catch(e: any) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  };

  if (isLoading) return <div className="p-12 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto" /></div>;
  if (!report) return <div>Error o no encontrado</div>;

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="inline-flex items-center text-sm text-zinc-500 hover:text-zinc-900 mb-6">
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver
        </Link>
        
        <h1 className="text-2xl font-bold text-zinc-900 mb-6">Detalle de Reporte</h1>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Información General</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="font-bold">Usuario:</span> {report.userEmail}</div>
                <div><span className="font-bold">ID Usuario:</span> {report.userId}</div>
                <div>
                  <span className="font-bold">Estado Actual:</span> 
                  <span className="ml-2 px-2 py-1 rounded bg-amber-100 text-amber-800 font-bold uppercase text-xs">
                    {report.status}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Confirmaciones de Contactos</CardTitle>
            </CardHeader>
            <CardContent>
              {report.confirmations.length === 0 ? (
                <p className="text-zinc-500 text-sm">Sin confirmaciones aún.</p>
              ) : (
                <div className="space-y-4">
                  {report.confirmations.map(conf => (
                    <div key={conf.id} className="p-4 border rounded bg-zinc-50">
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-bold">{conf.trustedContactName}</span>
                        <span className={`px-2 py-1 text-xs font-bold rounded uppercase ${conf.decision === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {conf.decision}
                        </span>
                      </div>
                      {conf.comments && <p className="text-sm text-zinc-600 bg-white p-2 rounded border">"{conf.comments}"</p>}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {report.status === 'admin_review' && (
            <Card className="border-rose-200 shadow-md">
              <CardContent className="p-6">
                <h3 className="font-bold text-lg mb-4 text-rose-800">Acción Requerida</h3>
                <p className="text-sm text-zinc-600 mb-6">Este reporte ha alcanzado el umbral requerido y necesita aprobación final del administrador para liberar el legado.</p>
                <div className="flex gap-4">
                  <Button variant="destructive" className="gap-2" onClick={handleReject} disabled={rejectMutation.isPending}>
                    <XCircle className="w-4 h-4" /> Rechazar y Bloquear
                  </Button>
                  <Button className="bg-green-600 hover:bg-green-700 gap-2 text-white" onClick={handleApprove} disabled={approveMutation.isPending}>
                    <CheckCircle className="w-4 h-4" /> Aprobar y Liberar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
