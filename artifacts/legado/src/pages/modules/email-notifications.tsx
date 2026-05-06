import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Command, CommandEmpty, CommandGroup, CommandInput,
  CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Mail, Loader2, ChevronsUpDown, Check, PackageX, FlaskConical,
  Beaker, ClipboardCheck, ShoppingBag, Plus, Trash2, AlertCircle,
  Database, PenLine,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ───────────────────────────────────────────────────────────────────
interface Product { id: string; code: string; name: string; warehouse: string; status: string; }
interface Supply  { id: string; code: string; description: string; unit: string; status: string; }

interface EmailItem { id: string; code: string; name: string; quantity: string; unit: string; }

// ─── Templates config ─────────────────────────────────────────────────────────
type TemplateId = "product-out" | "stock-colorante" | "stock-auxiliar" | "order-approval" | "plastic-bag";

interface TemplateConfig {
  id: TemplateId;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  endpoint: string;
  to: string[];
  cc?: string[];
  itemSource: "product" | "supply" | "both";
  hasNotes: boolean;
  isSingleProduct?: boolean;
}

const TEMPLATES: TemplateConfig[] = [
  {
    id: "product-out",
    label: "Fin de Producto",
    description: "Notifica el término total de un producto en el almacén",
    icon: PackageX,
    color: "text-red-600",
    bgColor: "bg-red-50",
    endpoint: "/api/notifications/product-out",
    to: ["judith.yachachin@sanjacinto.com.pe"],
    cc: ["laboratorio.tintoreria@sanjacinto.com.pe", "laboratorista.tintoreria@sanjacinto.com.pe", "ruben.roldan@sanjacinto.com.pe", "denis.miranda@sanjacinto.com.pe"],
    itemSource: "product",
    hasNotes: false,
    isSingleProduct: true,
  },
  {
    id: "stock-colorante",
    label: "Stock Físico — Colorante",
    description: "Informa el stock físico de colorantes al laboratorio",
    icon: FlaskConical,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    endpoint: "/api/notifications/stock-colorante",
    to: ["judith.yachachin@sanjacinto.com.pe"],
    cc: ["laboratorio.tintoreria@sanjacinto.com.pe", "laboratorista.tintoreria@sanjacinto.com.pe", "ruben.roldan@sanjacinto.com.pe"],
    itemSource: "product",
    hasNotes: false,
  },
  {
    id: "stock-auxiliar",
    label: "Stock Físico — Auxiliar",
    description: "Informa el stock físico de auxiliares al laboratorio",
    icon: Beaker,
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    endpoint: "/api/notifications/stock-auxiliar",
    to: ["judith.yachachin@sanjacinto.com.pe"],
    cc: ["laboratorio.tintoreria@sanjacinto.com.pe", "laboratorista.tintoreria@sanjacinto.com.pe", "ruben.roldan@sanjacinto.com.pe"],
    itemSource: "product",
    hasNotes: false,
  },
  {
    id: "order-approval",
    label: "Aprobación de Orden Interna",
    description: "Solicita aprobación de orden interna a Denis Miranda",
    icon: ClipboardCheck,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    endpoint: "/api/notifications/order-approval",
    to: ["denis.miranda@sanjacinto.com.pe"],
    itemSource: "supply",
    hasNotes: true,
  },
  {
    id: "plastic-bag",
    label: "Solicitud de Bolsas Plásticas",
    description: "Solicita peso de bolsas plásticas al almacén de repuestos",
    icon: ShoppingBag,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    endpoint: "/api/notifications/plastic-bag",
    to: ["almacen.despacho.repuestos@sanjacinto.com.pe", "almacen.recepcion.repuestos@sanjacinto.com.pe"],
    cc: ["alex.laredo@sanjacinto.com.pe"],
    itemSource: "supply",
    hasNotes: true,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) } });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error ?? "Error en el servidor"); }
  return res.json();
};

const newItem = (): EmailItem => ({ id: crypto.randomUUID(), code: "", name: "", quantity: "", unit: "" });

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProductCombobox({ value, products, loading, onChange }: {
  value: string; products: Product[]; loading: boolean; onChange: (p: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-sm">
          {selected ? <span className="truncate">{selected.name}</span>
            : <span className="text-slate-400">{loading ? "Cargando…" : "Buscar producto…"}</span>}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Código o nombre…" className="h-8" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {products.map(p => (
                <CommandItem key={p.id} value={`${p.code} ${p.name}`} onSelect={() => { onChange(p); setOpen(false); }}>
                  <Check className={`mr-2 h-3.5 w-3.5 ${value === p.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="font-mono text-xs bg-slate-100 px-1 rounded mr-1.5">{p.code}</span>
                  <span className="text-sm truncate">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function SupplyCombobox({ value, supplies, loading, onChange }: {
  value: string; supplies: Supply[]; loading: boolean; onChange: (s: Supply) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = supplies.find(s => s.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal h-9 text-sm">
          {selected ? <span className="truncate">{selected.description}</span>
            : <span className="text-slate-400">{loading ? "Cargando…" : "Buscar suministro…"}</span>}
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <Command>
          <CommandInput placeholder="Código o descripción…" className="h-8" />
          <CommandList>
            <CommandEmpty>Sin resultados. Puedes escribir el nombre manualmente.</CommandEmpty>
            <CommandGroup>
              {supplies.map(s => (
                <CommandItem key={s.id} value={`${s.code} ${s.description}`} onSelect={() => { onChange(s); setOpen(false); }}>
                  <Check className={`mr-2 h-3.5 w-3.5 ${value === s.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="font-mono text-xs bg-slate-100 px-1 rounded mr-1.5">{s.code}</span>
                  <span className="text-sm truncate">{s.description}</span>
                  <span className="ml-auto text-xs text-slate-400">{s.unit}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Template form for item-list templates ────────────────────────────────────
function ItemListForm({
  template, products, supplies, loadingProducts, loadingSupplies, onSuccess,
}: {
  template: TemplateConfig;
  products: Product[];
  supplies: Supply[];
  loadingProducts: boolean;
  loadingSupplies: boolean;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<(EmailItem & { _supplyId?: string; _productId?: string })[]>([newItem() as any]);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const addItem = () => setItems(it => [...it, newItem() as any]);
  const removeItem = (id: string) => setItems(it => it.filter(i => i.id !== id));
  const updateItem = (id: string, patch: Partial<EmailItem>) =>
    setItems(it => it.map(i => i.id === id ? { ...i, ...patch } : i));

  const sendMutation = useMutation({
    mutationFn: () => {
      const errs: string[] = [];
      items.forEach((it, idx) => {
        if (!it.name.trim()) errs.push(`Ítem ${idx + 1}: nombre requerido`);
        if (!it.quantity.trim()) errs.push(`Ítem ${idx + 1}: cantidad requerida`);
        if (!it.unit.trim()) errs.push(`Ítem ${idx + 1}: UM requerida`);
      });
      if (errs.length) { setErrors(errs); return Promise.reject(new Error(errs[0])); }
      setErrors([]);
      return api(template.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, notes: notes.trim() || undefined }),
      });
    },
    onSuccess: () => {
      toast({ title: "Correo enviado correctamente" });
      setItems([newItem() as any]);
      setNotes("");
      setErrors([]);
      onSuccess();
    },
    onError: (e: Error) => toast({ title: "Error al enviar", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      {/* Items table */}
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_1fr_90px_80px_36px] gap-2 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          <span>Código</span><span>Nombre / Descripción</span><span>Cantidad</span><span>UM</span><span />
        </div>
        {items.map((item, idx) => (
          <div key={item.id} className="grid grid-cols-[1fr_1fr_90px_80px_36px] gap-2 items-start">
            {/* Code — combobox or text */}
            {template.itemSource === "supply" ? (
              <SupplyCombobox
                value={item._supplyId ?? ""}
                supplies={supplies}
                loading={loadingSupplies}
                onChange={s => updateItem(item.id, { _supplyId: s.id, code: s.code, name: s.description, unit: s.unit })}
              />
            ) : (
              <ProductCombobox
                value={item._productId ?? ""}
                products={products}
                loading={loadingProducts}
                onChange={p => updateItem(item.id, { _productId: p.id, code: p.code, name: p.name, unit: "" })}
              />
            )}
            {/* Name — editable */}
            <Input
              placeholder="Nombre"
              value={item.name}
              onChange={e => updateItem(item.id, { name: e.target.value })}
              className="h-9 text-sm"
            />
            <Input
              placeholder="0"
              value={item.quantity}
              onChange={e => updateItem(item.id, { quantity: e.target.value })}
              className="h-9 text-sm"
            />
            <Input
              placeholder="kg"
              value={item.unit}
              onChange={e => updateItem(item.id, { unit: e.target.value })}
              className="h-9 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-slate-400 hover:text-red-500"
              onClick={() => removeItem(item.id)}
              disabled={items.length === 1}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1 text-xs">
          <Plus className="w-3.5 h-3.5" /> Agregar ítem
        </Button>
      </div>

      {template.hasNotes && (
        <div className="space-y-1.5">
          <Label className="text-sm">Observaciones <span className="text-slate-400 font-normal">(opcional)</span></Label>
          <Textarea
            placeholder="Comentarios adicionales…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            className="resize-none text-sm"
          />
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 space-y-1">
          {errors.map((e, i) => (
            <p key={i} className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{e}
            </p>
          ))}
        </div>
      )}

      <Button
        onClick={() => sendMutation.mutate()}
        disabled={sendMutation.isPending}
        className="w-full h-11 gap-2 text-base font-semibold"
      >
        {sendMutation.isPending
          ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</>
          : <><Mail className="w-4 h-4" /> Enviar Correo</>}
      </Button>
    </div>
  );
}

// ─── Single-product form (fin de producto) ────────────────────────────────────
function SingleProductForm({ template, products, loadingProducts }: {
  template: TemplateConfig; products: Product[]; loadingProducts: boolean;
}) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"catalog" | "manual">("catalog");
  const [selectedId, setSelectedId] = useState("");
  const [manual, setManual] = useState({ code: "", name: "" });
  const [error, setError] = useState("");

  const selectedProduct = products.find(p => p.id === selectedId);

  const sendMutation = useMutation({
    mutationFn: () => {
      if (mode === "catalog" && !selectedId) { setError("Selecciona un producto"); return Promise.reject(new Error("required")); }
      if (mode === "manual" && !manual.name.trim()) { setError("El nombre es requerido"); return Promise.reject(new Error("required")); }
      setError("");
      const payload = mode === "catalog"
        ? { productCode: selectedProduct?.code ?? "", productName: selectedProduct?.name ?? "" }
        : { productCode: manual.code.trim(), productName: manual.name.trim() };
      return api(template.endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      toast({ title: "Correo enviado correctamente" });
      setSelectedId(""); setManual({ code: "", name: "" }); setError("");
    },
    onError: (e: Error) => { if (e.message !== "required") toast({ title: "Error al enviar", description: e.message, variant: "destructive" }); },
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 bg-slate-100 p-1 rounded-lg w-fit">
        {(["catalog", "manual"] as const).map(m => (
          <button key={m} type="button" onClick={() => { setMode(m); setSelectedId(""); setManual({ code: "", name: "" }); setError(""); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${m === mode ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {m === "catalog" ? <><Database className="w-3 h-3" /> Del catálogo</> : <><PenLine className="w-3 h-3" /> Escribir</>}
          </button>
        ))}
      </div>

      {mode === "catalog" ? (
        <div className="space-y-1.5">
          <Label>Producto <span className="text-red-500">*</span></Label>
          <ProductCombobox value={selectedId} products={products} loading={loadingProducts}
            onChange={p => { setSelectedId(p.id); setError(""); }} />
          {selectedProduct && (
            <p className="text-xs text-slate-500">
              Código: <span className="font-mono font-semibold text-red-600">{selectedProduct.code}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Código <span className="text-slate-400 font-normal text-xs">(opcional)</span></Label>
            <Input placeholder="QC-1024" value={manual.code} onChange={e => setManual(m => ({ ...m, code: e.target.value }))} className="font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input placeholder="Ej. Índigo Carmín" value={manual.name}
              onChange={e => { setManual(m => ({ ...m, name: e.target.value })); if (e.target.value.trim()) setError(""); }}
              className={error ? "border-red-400" : ""} />
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}

      <Button onClick={() => sendMutation.mutate()} disabled={sendMutation.isPending} className="w-full h-11 gap-2 text-base font-semibold bg-red-600 hover:bg-red-700">
        {sendMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando…</> : <><Mail className="w-4 h-4" /> Enviar Correo</>}
      </Button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EmailNotificationsPage() {
  const { warehouse } = useWarehouse();
  const [activeTemplate, setActiveTemplate] = useState<TemplateId>("product-out");

  const template = TEMPLATES.find(t => t.id === activeTemplate)!;

  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["/api/products/all-active"],
    queryFn: () => api("/api/products?limit=2000&status=active").then((r: any) => r.data ?? r),
  });
  const { data: supplies = [], isLoading: loadingSupplies } = useQuery<Supply[]>({
    queryKey: ["/api/supplies"],
    queryFn: () => api("/api/supplies"),
  });

  const products = useMemo(() =>
    allProducts.filter(p => p.status === "active" && (warehouse === "all" || p.warehouse === warehouse)),
    [allProducts, warehouse]
  );

  const resetForm = useCallback(() => {}, []);

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
            <Mail className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Envío de Correos</h1>
            <p className="text-slate-500 text-sm">Selecciona una plantilla y completa los datos para enviar el correo</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-6">

          {/* Template selector sidebar */}
          <div className="w-full md:w-64 flex-shrink-0 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-2 mb-2">Plantillas</p>
            {TEMPLATES.map(t => {
              const Icon = t.icon;
              const isActive = t.id === activeTemplate;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTemplate(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isActive ? "bg-white/10" : t.bgColor}`}>
                    <Icon className={`w-4 h-4 ${isActive ? "text-white" : t.color}`} />
                  </div>
                  <span className="text-sm font-medium leading-tight">{t.label}</span>
                </button>
              );
            })}
          </div>

          {/* Form panel */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Template info */}
            <div className="bg-white rounded-xl border border-slate-100 p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${template.bgColor}`}>
                  <template.icon className={`w-5 h-5 ${template.color}`} />
                </div>
                <div>
                  <h2 className="font-semibold text-slate-900">{template.label}</h2>
                  <p className="text-xs text-slate-500">{template.description}</p>
                </div>
              </div>

              {/* Recipients summary */}
              <div className="bg-slate-50 rounded-lg px-4 py-3 space-y-2 text-xs">
                <div className="flex gap-2">
                  <span className="font-semibold text-slate-500 w-6">Para:</span>
                  <span className="text-slate-700">{template.to.join(", ")}</span>
                </div>
                {template.cc && template.cc.length > 0 && (
                  <div className="flex gap-2">
                    <span className="font-semibold text-slate-500 w-6">CC:</span>
                    <span className="text-slate-600">{template.cc.join(", ")}</span>
                  </div>
                )}
              </div>

              {/* Form */}
              {template.isSingleProduct ? (
                <SingleProductForm template={template} products={products} loadingProducts={loadingProducts} />
              ) : (
                <ItemListForm
                  key={activeTemplate}
                  template={template}
                  products={products}
                  supplies={supplies.filter(s => s.status === "active")}
                  loadingProducts={loadingProducts}
                  loadingSupplies={loadingSupplies}
                  onSuccess={resetForm}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
