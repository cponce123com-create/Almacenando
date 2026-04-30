import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders } from "@/hooks/use-auth";
import { useWarehouse } from "@/contexts/WarehouseContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Bell,
  Loader2,
  ChevronsUpDown,
  Check,
  Mail,
  AlertCircle,
  X,
  Search,
} from "lucide-react";

// ── Configuración centralizada ───────────────────────────────────────────────
const CONFIG = {
  BASE_URL: import.meta.env.BASE_URL.replace(/\/$/, ""),
  API_ENDPOINTS: {
    PRODUCTS: "/api/products",
    LOT_CHANGE: "/api/notifications/lot-change",
  },
  QUERIES: {
    PRODUCTS: "products:active",
  },
  LIMITS: {
    PRODUCTS: 2000,
  },
} as const;

const LOT_CHANGE_RECIPIENTS = [
  "judith.yachachin@sanjacinto.com.pe",
  "laboratorio.quimico@sanjacinto.com.pe",
  "laboratorista.tintoreria@sanjacinto.com.pe",
  "controlistas.tintoreria@sanjacinto.com.pe",
  "ruben.roldan@sanjacinto.com.pe",
  "supervisor.tintoreria@sanjacinto.com.pe",
] as const;

// ── Tipos ────────────────────────────────────────────────────────────────────
interface Product {
  id: string;
  code: string;
  name: string;
  warehouse: string;
  status: "active" | "inactive" | "archived";
}

interface LotChangeForm {
  productId: string;
  oldLot: string;
  newLot: string;
  productionOrder: string;
}

type FormErrors = Partial<Record<keyof LotChangeForm, string>>;

interface ApiOptions extends RequestInit {
  skipAuth?: boolean;
}

// ── Utilidades ───────────────────────────────────────────────────────────────
const api = async <T = unknown>(path: string, options?: ApiOptions): Promise<T> => {
  const { skipAuth, ...fetchOptions } = options ?? {};

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(skipAuth ? {} : getAuthHeaders()),
    ...(fetchOptions.headers ?? {}),
  };

  try {
    const response = await fetch(`${CONFIG.BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error ?? `Error ${response.status}: ${response.statusText}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Error de conexión con el servidor");
  }
};

const EMPTY_FORM: LotChangeForm = {
  productId: "",
  oldLot: "",
  newLot: "",
  productionOrder: "",
};

// ── Hook personalizado para validación del formulario ─────────────────────────
const useLotChangeForm = () => {
  const [form, setForm] = useState<LotChangeForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [touched, setTouched] = useState<Partial<Record<keyof LotChangeForm, boolean>>>({});

  const setField = useCallback((field: keyof LotChangeForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (value.trim() && errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const markTouched = useCallback((field: keyof LotChangeForm) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }, []);

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!form.productId) {
      newErrors.productId = "Selecciona un producto";
    }
    if (!form.oldLot.trim()) {
      newErrors.oldLot = "El lote antiguo es requerido";
    } else if (form.oldLot.trim().length < 3) {
      newErrors.oldLot = "El lote debe tener al menos 3 caracteres";
    }
    if (!form.newLot.trim()) {
      newErrors.newLot = "El nuevo lote es requerido";
    } else if (form.newLot.trim().length < 3) {
      newErrors.newLot = "El lote debe tener al menos 3 caracteres";
    }
    if (!form.productionOrder.trim()) {
      newErrors.productionOrder = "La orden de producción es requerida";
    } else if (!/^[\w\-\.]+$/i.test(form.productionOrder.trim())) {
      newErrors.productionOrder = "Formato de orden inválido";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [form]);

  const reset = useCallback(() => {
    setForm(EMPTY_FORM);
    setErrors({});
    setTouched({});
  }, []);

  return {
    form,
    errors,
    touched,
    setField,
    markTouched,
    validate,
    reset,
    isValid: Object.keys(errors).length === 0 && form.productId !== "",
  };
};

// ── Componente Principal ─────────────────────────────────────────────────────
export default function LotChangeNotificationPage() {
  const { toast } = useToast();
  const { warehouse } = useWarehouse();
  const queryClient = useQueryClient();

  const {
    form,
    errors,
    touched,
    setField,
    markTouched,
    validate,
    reset,
  } = useLotChangeForm();

  const [productOpen, setProductOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // ── Query: Productos ──────────────────────────────────────────────────────
  const { data: allProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: [CONFIG.QUERIES.PRODUCTS, warehouse],
    queryFn: () =>
      api<{ data: Product[] }>(
        `${CONFIG.API_ENDPOINTS.PRODUCTS}?limit=${CONFIG.LIMITS.PRODUCTS}&status=active`
      ).then((res) => res.data ?? []),
    staleTime: 5 * 60 * 1000, // 5 minutos
    gcTime: 30 * 60 * 1000,   // 30 minutos
  });

  // ── Filtro de productos con búsqueda ───────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const baseFilter = allProducts.filter(
      (p) => p.status === "active" && (warehouse === "all" || p.warehouse === warehouse)
    );

    if (!searchQuery.trim()) return baseFilter;

    const query = searchQuery.toLowerCase();
    return baseFilter.filter(
      (p) =>
        p.code.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query)
    );
  }, [allProducts, warehouse, searchQuery]);

  // ── Producto seleccionado ──────────────────────────────────────────────────
  const selectedProduct = useMemo(() => {
    if (!form.productId) return null;
    return allProducts.find((p) => p.id === form.productId) ?? null;
  }, [allProducts, form.productId]);

  // ── Mutación: Enviar notificación ──────────────────────────────────────────
  const sendMutation = useMutation({
    mutationFn: () =>
      api(CONFIG.API_ENDPOINTS.LOT_CHANGE, {
        method: "POST",
        body: JSON.stringify(form),
      }),
    onSuccess: () => {
      toast({
        title: "✅ Notificación enviada",
        description: `Se notificó el cambio de lote a ${LOT_CHANGE_RECIPIENTS.length} destinatarios.`,
        duration: 5000,
      });
      reset();
      queryClient.invalidateQueries({ queryKey: [CONFIG.QUERIES.PRODUCTS] });
    },
    onError: (error: Error) => {
      toast({
        title: "❌ Error al enviar",
        description: error.message,
        variant: "destructive",
        duration: 7000,
      });
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (validate()) {
        sendMutation.mutate();
      } else {
        Object.keys(EMPTY_FORM).forEach((key) => {
          markTouched(key as keyof LotChangeForm);
        });
      }
    },
    [validate, markTouched, sendMutation]
  );

  const handleProductSelect = useCallback((productId: string) => {
    setField("productId", productId);
    setProductOpen(false);
    setSearchQuery("");
    markTouched("productId");
  }, [setField, markTouched]);

  const handleClearProduct = useCallback(() => {
    setField("productId", "");
    setSearchQuery("");
  }, [setField]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto px-4 py-6">

        {/* Header */}
        <header className="flex items-start gap-4 pb-4 border-b border-slate-100">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-6 h-6 text-amber-600" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-slate-900">Cambio de Lote</h1>
            <p className="text-slate-500 text-sm mt-1">
              Notifica a los destinatarios del área sobre un cambio de lote de colorante
            </p>
          </div>
        </header>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 p-6 space-y-5 shadow-sm">

          {/* Selector de Producto */}
          <div className="space-y-1.5">
            <Label htmlFor="product-select">
              Colorante / Producto <span className="text-red-500" aria-hidden="true">*</span>
            </Label>

            <Popover open={productOpen} onOpenChange={setProductOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={productOpen}
                  aria-controls="product-command-list"
                  aria-label="Seleccionar producto"
                  className={`w-full justify-between font-normal h-10 ${
                    errors.productId && touched.productId
                      ? "border-red-400 focus:ring-red-400"
                      : ""
                  }`}
                  id="product-select"
                >
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    {selectedProduct ? (
                      <>
                        <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">
                          {selectedProduct.code}
                        </span>
                        <span className="truncate">{selectedProduct.name}</span>
                      </>
                    ) : (
                      <span className="text-slate-400">
                        {loadingProducts ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Cargando…
                          </span>
                        ) : (
                          "Buscar producto…"
                        )}
                      </span>
                    )}
                  </span>

                  {selectedProduct ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-slate-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearProduct();
                      }}
                      aria-label="Limpiar selección"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  ) : (
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                  )}
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start" sideOffset={4}>
                <Command shouldFilter={false}>
                  <div className="flex items-center border-b px-3" cmdk-input-wrapper="">
                    <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                    <CommandInput
                      placeholder="Buscar por código o nombre…"
                      className="border-0 h-10 focus:ring-0"
                      value={searchQuery}
                      onValueChange={setSearchQuery}
                    />
                  </div>
                  <CommandList id="product-command-list">
                    <CommandEmpty className="py-6 text-center text-sm text-slate-500">
                      {searchQuery ? "No se encontraron resultados" : "Comienza a escribir para buscar"}
                    </CommandEmpty>
                    <CommandGroup>
                      {filteredProducts.map((product) => (
                        <CommandItem
                          key={product.id}
                          value={`${product.code} ${product.name}`}
                          onSelect={() => handleProductSelect(product.id)}
                          className="cursor-pointer"
                        >
                          <Check
                            className={`mr-2 h-4 w-4 shrink-0 ${
                              form.productId === product.id ? "opacity-100" : "opacity-0"
                            }`}
                            aria-hidden="true"
                          />
                          <span className="font-mono text-xs bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded mr-2">
                            {product.code}
                          </span>
                          <span className="text-sm truncate flex-1">{product.name}</span>
                          <span className="text-xs text-slate-400 ml-2">{product.warehouse}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Información del producto seleccionado */}
            {selectedProduct && (
              <p className="text-xs text-slate-500 mt-1 pl-1" role="status" aria-live="polite">
                Almacén: <span className="font-medium text-slate-700">{selectedProduct.warehouse}</span>
              </p>
            )}

            {/* Mensaje de error */}
            {errors.productId && touched.productId && (
              <p
                className="text-xs text-red-500 flex items-center gap-1 pl-1"
                role="alert"
                id="product-error"
              >
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {errors.productId}
              </p>
            )}
          </div>

          {/* Campos de Lotes (Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Lote Antiguo */}
            <div className="space-y-1.5">
              <Label htmlFor="oldLot">
                Lote Antiguo <span className="text-red-500" aria-hidden="true">*</span>
              </Label>
              <Input
                id="oldLot"
                placeholder="Ej. L-2024-001"
                value={form.oldLot}
                onChange={(e) => setField("oldLot", e.target.value)}
                onBlur={() => markTouched("oldLot")}
                className={`h-10 ${
                  errors.oldLot && touched.oldLot
                    ? "border-red-400 focus-visible:ring-red-400"
                    : ""
                }`}
                aria-invalid={!!(errors.oldLot && touched.oldLot)}
                aria-describedby={errors.oldLot && touched.oldLot ? "oldLot-error" : undefined}
                pattern="^[\w\-\.]{3,}$"
                inputMode="text"
              />
              {errors.oldLot && touched.oldLot && (
                <p className="text-xs text-red-500 flex items-center gap-1" role="alert" id="oldLot-error">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {errors.oldLot}
                </p>
              )}
            </div>

            {/* Nuevo Lote */}
            <div className="space-y-1.5">
              <Label htmlFor="newLot">
                Nuevo Lote <span className="text-red-500" aria-hidden="true">*</span>
              </Label>
              <Input
                id="newLot"
                placeholder="Ej. L-2024-002"
                value={form.newLot}
                onChange={(e) => setField("newLot", e.target.value)}
                onBlur={() => markTouched("newLot")}
                className={`h-10 ${
                  errors.newLot && touched.newLot
                    ? "border-red-400 focus-visible:ring-red-400"
                    : ""
                }`}
                aria-invalid={!!(errors.newLot && touched.newLot)}
                aria-describedby={errors.newLot && touched.newLot ? "newLot-error" : undefined}
                pattern="^[\w\-\.]{3,}$"
                inputMode="text"
              />
              {errors.newLot && touched.newLot && (
                <p className="text-xs text-red-500 flex items-center gap-1" role="alert" id="newLot-error">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  {errors.newLot}
                </p>
              )}
            </div>
          </div>

          {/* Orden de Producción */}
          <div className="space-y-1.5">
            <Label htmlFor="productionOrder">
              Orden de Producción <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <Input
              id="productionOrder"
              placeholder="Ej. OP-2024-0123"
              value={form.productionOrder}
              onChange={(e) => setField("productionOrder", e.target.value)}
              onBlur={() => markTouched("productionOrder")}
              className={`h-10 ${
                errors.productionOrder && touched.productionOrder
                  ? "border-red-400 focus-visible:ring-red-400"
                  : ""
              }`}
              aria-invalid={!!(errors.productionOrder && touched.productionOrder)}
              aria-describedby={errors.productionOrder && touched.productionOrder ? "productionOrder-error" : undefined}
              pattern="^[\w\-\.]+$"
              inputMode="text"
            />
            {errors.productionOrder && touched.productionOrder && (
              <p className="text-xs text-red-500 flex items-center gap-1" role="alert" id="productionOrder-error">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                {errors.productionOrder}
              </p>
            )}
          </div>

          {/* Botón de Envío */}
          <Button
            type="submit"
            disabled={sendMutation.isPending}
            className="w-full gap-2 h-11 text-base font-semibold bg-amber-500 hover:bg-amber-600 active:bg-amber-700 transition-colors duration-200 focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed"
            aria-busy={sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Enviando notificación…</span>
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" aria-hidden="true" />
                <span>Enviar Notificación</span>
              </>
            )}
          </Button>
        </form>

        {/* Información de Destinatarios */}
        <aside
          className="bg-slate-50 border border-slate-200 rounded-xl p-5"
          aria-labelledby="recipients-heading"
        >
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <h2 id="recipients-heading" className="text-sm font-semibold text-slate-700">
              Destinatarios del correo ({LOT_CHANGE_RECIPIENTS.length})
            </h2>
          </div>

          <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-2" role="list">
            {LOT_CHANGE_RECIPIENTS.map((email) => (
              <li key={email} className="flex items-center gap-2 text-sm text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" aria-hidden="true" />
                <span className="font-mono text-xs break-all">{email}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-200">
            El correo se enviará con el asunto:
            <br />
            <span className="font-medium text-slate-500 italic">
              "Notificación de Cambio de Lote — {selectedProduct?.name ?? "[producto]"}"
            </span>
          </p>
        </aside>

      </div>
    </AppLayout>
  );
}
