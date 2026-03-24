import { AppLayout } from "@/components/layout/AppLayout";
import { TestTube } from "lucide-react";

export default function MuestrasPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <TestTube className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Muestras</h1>
            <p className="text-slate-500 text-sm">las muestras tomadas de los productos</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
          <TestTube className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Módulo en Desarrollo</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            El módulo de Muestras está siendo implementado. Aquí podrás gestionar las muestras tomadas de los productos.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
