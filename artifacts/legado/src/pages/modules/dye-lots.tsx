import { AppLayout } from "@/components/layout/AppLayout";
import { Layers } from "lucide-react";

export default function LotesyTinturasPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
            <Layers className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Lotes y Tinturas</h1>
            <p className="text-slate-500 text-sm">los lotes y tinturas recibidos</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-12 text-center">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">Módulo en Desarrollo</h3>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            El módulo de Lotes y Tinturas está siendo implementado. Aquí podrás gestionar los lotes y tinturas recibidos.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
