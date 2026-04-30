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
import { Bell, Loader2, ChevronsUpDown, Check, Mail, AlertCircle } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const LOT_CHANGE_RECIPIENTS = [
  "judith.yachachin@sanjacinto.com.pe",
  "laboratorio.quimico@sanjacinto.com.pe",
  "laboratorista.tintoreria@sanjacinto.com.pe",
  "controlistas.tintoreria@sanjacinto.com.pe",
  "ruben.roldan@sanjacinto.com.pe",
  "supervisor.tintoreria@sanjacinto.com.pe",
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

const emptyForm = { productId: "", oldLot: "", newLot: "", productionOrder: "" };
type FormState = typeof emptyForm;
type FormErrors = Partial<Record<keyof FormState, string>>;

export default function LotChangeNotificationPage() {
  const { toast } = useToast();
  const { warehouse } = useWarehouse();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [productOpen, setProductOpen] = useState(false);

  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products/all-active"],
    queryFn: () => api("/api/products?limit=2000&status=active").then((r: any) => r.data ?? r),
  });

  const products = useMemo(() =>
    allProducts.filter(p =>
      p.status === "active" && (warehouse === "all" || p.warehouse === warehouse)
    ),
    [allProducts, warehouse]
  );

  const selectedProduct = useMemo(() =>
    products.find(p => p.id === form.productId) ?? allProducts.find(p => p.id === form.productId),
    [products, allProducts, form.productId]
  );

  const setField = (k: keyof FormState, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    if (v.trim()) setErrors(e => ({ ...e, [k]: undefined }));
  };

  const validate = (): boolean => {
    const errs: FormErrors = {};
    if (!form.productId) errs.productId = "Selecciona un producto";
    if (!form.oldLot.trim()) errs.oldLot = "El lote antiguo es requerido";
    if (!form.newLot.trim()) errs.newLot = "El nuevo lote es requerido";
    if (!form.productionOrder.trim()) errs.productionOrder = "La orden de producción es requerida";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const sendMutation = useMutation({
    mutationFn: () => api("/api/notifications/lot-change", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      toast({ title: "Notificación enviada correctamente", description: `Se notificó el cambio de lote a ${LOT_CHANGE_RECIPIENTS.length} destinatarios.` });
      setForm(emptyForm);
      setErrors({});
    },
    onError: (e: Error) => toast({ title: "Error al enviar", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) sendMutation.mutate();
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Cambio de Lote</h1>
            <p className="text-slate-500 text-sm">Notifica a los destinatarios del área sobre un cambio de lote de colorante</p>
          </div>
        </div>

        {/* Form card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 p-6 space-y-5">

          {/* Product combobox */}
          <div className="space-y-1.5">
            <Label>Colorante / Producto <span className="text-red-500">*</span></Label>
            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={productOpen}
                  className={`w-full justify-between font-normal ${errors.productId ? "border-red-400 focus:ring-red-400" : ""}`}
                >
                  {selectedProduct
                    ? <span className="truncate">{selectedProduct.name}</span>
                    : <span className="text-slate-400">{loadingProducts ? "Cargando productos…" : "Buscar producto…"}</span>
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
                            setField("productId", p.id);
                            setProductOpen(false);
                          }}
                        >
                          <Check className={`mr-2 h-4 w-4 ${form.productId === p.id ? "opacity-100" : "opacity-0"}`} />
                          <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded mr-2">{p.code}</span>
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
                Código: <span className="font-mono font-semibold text-indigo-600">{selectedProduct.code}</span>
                <span className="ml-2 text-slate-400">· Almacén: {selectedProduct.warehouse}</span>
              </p>
            )}
            {errors.productId && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.productId}</p>
            )}
          </div>

          {/* Lot fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Lote Antiguo <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ej. L-2024-001"
                value={form.oldLot}
                onChange={e => setField("oldLot", e.target.value)}
                className={errors.oldLot ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
              {errors.oldLot && (
                <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.oldLot}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Nuevo Lote <span className="text-red-500">*</span></Label>
              <Input
                placeholder="Ej. L-2024-002"
                value={form.newLot}
                onChange={e => setField("newLot", e.target.value)}
                className={errors.newLot ? "border-red-400 focus-visible:ring-red-400" : ""}
              />
              {errors.newLot && (
                <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.newLot}</p>
              )}
            </div>
          </div>

          {/* Production order */}
          <div className="space-y-1.5">
            <Label>Orden de Producción <span className="text-red-500">*</span></Label>
            <Input
              placeholder="Ej. OP-2024-0123"
              value={form.productionOrder}
              onChange={e => setField("productionOrder", e.target.value)}
              className={errors.productionOrder ? "border-red-400 focus-visible:ring-red-400" : ""}
            />
            {errors.productionOrder && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{errors.productionOrder}</p>
            )}
          </div>

          {/* Submit */}
<Button
  type="submit"
  disabled={sendMutation.isPending}
  className="w-full text-white gap-2 h-11 text-base font-semibold"
  style={{
    backgroundColor: sendMutation.isPending ? "#9ca3af" : "#f59e0b"
  }}
  onMouseOver={(e) => {
    if (!sendMutation.isPending) {
      e.currentTarget.style.backgroundColor = "#d97706"
    }
  }}
  onMouseOut={(e) => {
    if (!sendMutation.isPending) {
      e.currentTarget.style.backgroundColor = "#f59e0b"
    }
  }}
>
  {sendMutation.isPending
    ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
    : <><Bell className="w-4 h-4" /> Enviar Notificación</>
  }
</Button>
        </form>

        {/* Recipients info box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-semibold text-slate-700">Destinatarios del correo ({LOT_CHANGE_RECIPIENTS.length})</p>
          </div>
          <ul className="space-y-1.5">
            {LOT_CHANGE_RECIPIENTS.map(email => (
              <li key={email} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                <span className="font-mono text-xs">{email}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-400 mt-3">
            El correo se enviará a todos los destinatarios con el asunto:<br />
            <span className="font-medium text-slate-500 italic">"Notificación de Cambio de Lote — [nombre del producto]"</span>
          </p>
        </div>

      </div>
    </AppLayout>
  );
}
