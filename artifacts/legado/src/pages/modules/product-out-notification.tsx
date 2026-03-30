import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PackageX, Loader2, ChevronsUpDown, Check, Mail, AlertCircle, Database, PenLine } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const PRODUCT_OUT_TO = "judith.yachachin@sanjacinto.com.pe";
const PRODUCT_OUT_CC = [
  "laboratorio.tintoreria@sanjacinto.com.pe",
  "laboratorista.tintoreria@sanjacinto.com.pe",
  "ruben.roldan@sanjacinto.com.pe",
  "denis.miranda@sanjacinto.com.pe",
];

interface Product {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  status: string;
}

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

type Mode = "catalog" | "manual";

const emptyManual = { productCode: "", productName: "" };

export default function ProductOutNotificationPage() {
  const { toast } = useToast();
  const { warehouse } = useWarehouse();

  const [mode, setMode] = useState<Mode>("catalog");
  const [productOpen, setProductOpen] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [manual, setManual] = useState(emptyManual);
  const [errors, setErrors] = useState<{ product?: string; productName?: string }>({});

  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products/all-active"],
    queryFn: () => api("/api/products?limit=2000&status=active").then((r: any) => r.data ?? r),
  });

  const products = useMemo(() =>
    allProducts.filter(p => p.status === "active" && (warehouse === "all" || p.warehouse === warehouse)),
    [allProducts, warehouse]
  );

  const selectedProduct = useMemo(() =>
    products.find(p => p.id === selectedId) ?? allProducts.find(p => p.id === selectedId),
    [products, allProducts, selectedId]
  );

  const validate = (): boolean => {
    const errs: typeof errors = {};
    if (mode === "catalog" && !selectedId) errs.product = "Selecciona un producto del catálogo";
    if (mode === "manual" && !manual.productName.trim()) errs.productName = "El nombre del producto es requerido";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const sendMutation = useMutation({
    mutationFn: () => {
      const payload = mode === "catalog"
        ? { productCode: selectedProduct?.code ?? "", productName: selectedProduct?.name ?? "" }
        : { productCode: manual.productCode.trim(), productName: manual.productName.trim() };
      return api("/api/notifications/product-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (_data, _variables) => {
      const name = mode === "catalog" ? (selectedProduct?.name ?? "") : manual.productName;
      toast({ title: "Notificación enviada", description: `Se notificó el término de "${name}" correctamente.` });
      setSelectedId("");
      setManual(emptyManual);
      setErrors({});
    },
    onError: (e: Error) => toast({ title: "Error al enviar", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) sendMutation.mutate();
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setSelectedId("");
    setManual(emptyManual);
    setErrors({});
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
            <PackageX className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Fin de Producto</h1>
            <p className="text-slate-500 text-sm">Notifica al área cuando un producto ha llegado a su término total en el almacén</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-fit">
          <button
            type="button"
            onClick={() => switchMode("catalog")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "catalog"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Del catálogo
          </button>
          <button
            type="button"
            onClick={() => switchMode("manual")}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              mode === "manual"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <PenLine className="w-3.5 h-3.5" />
            Escribir manualmente
          </button>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">

          {mode === "catalog" ? (
            <div className="space-y-1.5">
              <Label>Producto <span className="text-red-500">*</span></Label>
              <Popover open={productOpen} onOpenChange={setProductOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={productOpen}
                    className={`w-full justify-between font-normal ${errors.product ? "border-red-400 focus:ring-red-400" : ""}`}
                  >
                    {selectedProduct
                      ? <span className="truncate">{selectedProduct.name}</span>
                      : <span className="text-slate-400">{loadingProducts ? "Cargando productos…" : "Buscar por código o nombre…"}</span>
                    }
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por código o nombre…" className="h-9" />
                    <CommandList>
                      <CommandEmpty>Sin resultados.</CommandEmpty>
                      <CommandGroup>
                        {products.map(p => (
                          <CommandItem
                            key={p.id}
                            value={`${p.code} ${p.name}`}
                            onSelect={() => {
                              setSelectedId(p.id);
                              setErrors(e => ({ ...e, product: undefined }));
                              setProductOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedId === p.id ? "opacity-100" : "opacity-0"}`} />
                            <span className="font-mono text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded mr-2">{p.code}</span>
                            <span className="text-sm truncate">{p.name}</span>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedProduct && (
                <p className="text-xs text-slate-500 mt-1">
                  Código: <span className="font-mono font-semibold text-red-600">{selectedProduct.code}</span>
                  <span className="ml-2 text-slate-400">· Almacén: {selectedProduct.warehouse}</span>
                </p>
              )}
              {errors.product && (
                <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.product}</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Código del producto <span className="text-slate-400 font-normal text-xs">(opcional)</span></Label>
                <Input
                  placeholder="Ej. QC-1024"
                  value={manual.productCode}
                  onChange={e => setManual(m => ({ ...m, productCode: e.target.value }))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre del producto <span className="text-red-500">*</span></Label>
                <Input
                  placeholder="Ej. Índigo Carmín"
                  value={manual.productName}
                  onChange={e => {
                    setManual(m => ({ ...m, productName: e.target.value }));
                    if (e.target.value.trim()) setErrors(errs => ({ ...errs, productName: undefined }));
                  }}
                  className={errors.productName ? "border-red-400 focus-visible:ring-red-400" : ""}
                />
                {errors.productName && (
                  <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.productName}</p>
                )}
              </div>
            </div>
          )}

          {/* Preview of what will be sent */}
          {((mode === "catalog" && selectedProduct) || (mode === "manual" && manual.productName.trim())) && (
            <div className="bg-slate-50 rounded-lg px-4 py-3 text-sm text-slate-600 border border-slate-200">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Vista previa del asunto</p>
              <p className="font-medium text-slate-800 italic">
                {mode === "catalog"
                  ? `Término de Producto (${selectedProduct!.code}) — ${selectedProduct!.name}`
                  : `Término de Producto${manual.productCode.trim() ? ` (${manual.productCode.trim()})` : ""} — ${manual.productName.trim()}`
                }
              </p>
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            disabled={sendMutation.isPending}
            className="w-full bg-red-600 hover:bg-red-700 text-white gap-2 h-11 text-base font-semibold"
          >
            {sendMutation.isPending
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
              : <><PackageX className="w-4 h-4" /> Enviar Notificación</>
            }
          </Button>
        </form>

        {/* Recipients info box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">Destinatarios del correo</p>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Para</p>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                <span className="font-medium">Judith Yachachín</span>
                <span className="font-mono text-xs text-slate-400">&lt;{PRODUCT_OUT_TO}&gt;</span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Con copia (CC)</p>
              <ul className="space-y-1.5">
                {[
                  { name: "Laboratorio Tintorería", email: PRODUCT_OUT_CC[0] },
                  { name: "Laboratorista Tintorería", email: PRODUCT_OUT_CC[1] },
                  { name: "Ruben Roldan", email: PRODUCT_OUT_CC[2] },
                  { name: "Denis Miranda", email: PRODUCT_OUT_CC[3] },
                ].map(r => (
                  <li key={r.email} className="flex items-center gap-2 text-sm text-slate-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                    <span className="font-medium">{r.name}</span>
                    <span className="font-mono text-xs text-slate-400">&lt;{r.email}&gt;</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-200">
            Remitente: <span className="font-medium text-slate-500">Carlos Ponce — Supervisor de Cocina Colores</span>
          </p>
        </div>

      </div>
    </AppLayout>
  );
}
