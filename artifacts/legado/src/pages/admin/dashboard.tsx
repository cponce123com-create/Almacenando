import { useAdminReports } from "@/hooks/use-admin";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, ShieldAlert, ArrowRight } from "lucide-react";
import { format } from "date-fns";

export default function AdminDashboard() {
  const { data: reports, isLoading } = useAdminReports();

  return (
    <div className="min-h-screen bg-zinc-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 flex items-center gap-2">
            <ShieldAlert className="text-rose-600" /> Panel de Administración
          </h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : (
          <Card className="shadow-sm">
            <CardContent className="p-0">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr>
                    <th className="p-4 font-medium text-zinc-500">Usuario</th>
                    <th className="p-4 font-medium text-zinc-500">Estado</th>
                    <th className="p-4 font-medium text-zinc-500">Confirmaciones</th>
                    <th className="p-4 font-medium text-zinc-500">Fecha</th>
                    <th className="p-4 font-medium text-zinc-500">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 bg-white">
                  {reports?.map((r) => (
                    <tr key={r.id} className="hover:bg-zinc-50">
                      <td className="p-4">
                        <div className="font-medium text-zinc-900">{r.userEmail}</div>
                        <div className="text-xs text-zinc-500">{r.id}</div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                          r.status === 'admin_review' ? 'bg-amber-100 text-amber-700' :
                          r.status === 'released' ? 'bg-green-100 text-green-700' :
                          'bg-zinc-100 text-zinc-700'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="p-4">{r.confirmationsCount}</td>
                      <td className="p-4 text-sm text-zinc-500">{format(new Date(r.createdAt), 'dd/MM/yyyy')}</td>
                      <td className="p-4">
                        <Link href={`/admin/death-reports/${r.id}`}>
                          <button className="flex items-center text-sm font-medium text-blue-600 hover:text-blue-800">
                            Ver Detalles <ArrowRight className="w-4 h-4 ml-1" />
                          </button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {reports?.length === 0 && (
                    <tr><td colSpan={5} className="p-8 text-center text-zinc-500">No hay reportes de fallecimiento.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
