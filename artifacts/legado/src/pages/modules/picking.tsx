import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PackageCheck,
  Package,
  Plus,
  Search,
  Loader2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Scan,
  Clock,
  ArrowRight,
  ClipboardList,
  ListTodo,
  Eye,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ── Types ──────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  location?: string;
}

interface PickingOrderItem {
  id: string;
  orderId: string;
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  pickedQuantity: number;
  location?: string;
  warehouse?: string;
  zone?: string;
  rack?: string;
  shelf?: string;
  position?: string;
  scanned: boolean;
  scannedAt?: string;
}

interface PickingOrder {
  id: string;
  orderNumber: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  items: PickingOrderItem[];
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface OrderFormItem {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  maxStock: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const api = async (path: string, opts?: RequestInit) => {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error ?? "Error en el servidor");
  }
  return res.json();
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pendiente", color: "#92400e", bg: "#fef3c7" },
  in_progress: { label: "En Progreso", color: "#1e40af", bg: "#dbeafe" },
  completed: { label: "Completado", color: "#166534", bg: "#dcfce7" },
  cancelled: { label: "Cancelado", color: "#991b1b", bg: "#fef2f2" },
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function PreparacionDePedidosPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [tab, setTab] = useState<"create" | "orders" | "detail">("create");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);

  // ── Create order state ───────────────────────────────────────────────────────
  const [productSearch, setProductSearch] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<OrderFormItem[]>([]);
  const [showProductDialog, setShowProductDialog] = useState(false);

  // ── Scanner state (inline in detail) ─────────────────────────────────────────
  const [scannerItemId, setScannerItemId] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    queryFn: () => api("/api/products"),
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<PickingOrder[]>({
    queryKey: ["/api/picking/orders"],
    queryFn: () => api("/api/picking/orders"),
  });

  const selectedOrder = useMemo(
    () => orders.find((o) => o.id === selectedOrderId) ?? null,
    [orders, selectedOrderId]
  );

  // ── Mutations ────────────────────────────────────────────────────────────────
  const createOrderMutation = useMutation({
    mutationFn: (items: OrderFormItem[]) =>
      api("/api/picking/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/picking/orders"] });
      toast({ title: "Orden creada", description: "La orden de picking fue creada exitosamente." });
      setSelectedProducts([]);
      setTab("orders");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const scanItemMutation = useMutation({
    mutationFn: ({ itemId, barcode }: { itemId: string; barcode: string }) =>
      api(`/api/picking/items/${itemId}/scan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/picking/orders"] });
      toast({ title: "Item escaneado", description: "Producto registrado como picking completado." });
      setScannerItemId(null);
      setManualBarcode("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // ── Product selection helpers ────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const term = productSearch.toLowerCase();
    return products.filter((p) => {
      return (
        !term ||
        p.code.toLowerCase().includes(term) ||
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term)
      );
    });
  }, [products, productSearch]);

  const addProduct = (product: Product) => {
    setSelectedProducts((prev) => {
      const existing = prev.find((p) => p.productId === product.id);
      if (existing) {
        return prev.map((p) =>
          p.productId === product.id ? { ...p, quantity: Math.min(p.quantity + 1, p.maxStock) } : p
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          productCode: product.code,
          productName: product.name,
          quantity: 1,
          maxStock: product.stock,
        },
      ];
    });
  };

  const updateQuantity = (productId: string, qty: number) => {
    setSelectedProducts((prev) =>
      prev.map((p) =>
        p.productId === productId
          ? { ...p, quantity: Math.max(1, Math.min(qty, p.maxStock)) }
          : p
      )
    );
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts((prev) => prev.filter((p) => p.productId !== productId));
  };

  const handleCreateOrder = () => {
    if (selectedProducts.length === 0) {
      toast({ title: "Sin productos", description: "Agrega al menos un producto a la orden.", variant: "destructive" });
      return;
    }
    createOrderMutation.mutate(selectedProducts);
  };

  // ── Scanner functions ────────────────────────────────────────────────────────
  const startInlineScanner = useCallback(async (itemId: string) => {
    setScannerItemId(itemId);
    setManualBarcode("");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop().catch(() => {});
        await html5QrCodeRef.current.clear().catch(() => {});
      }

      const scannerId = `picking-scanner-${itemId}`;
      await new Promise((r) => setTimeout(r, 100));

      let container = document.getElementById(scannerId);
      if (!container) {
        container = document.createElement("div");
        container.id = scannerId;
        if (scannerRef.current) {
          scannerRef.current.innerHTML = "";
          scannerRef.current.appendChild(container);
        }
      }

      const html5QrCode = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 200, height: 200 } },
        (decodedText: string) => {
          scanItemMutation.mutate({ itemId, barcode: decodedText });
          html5QrCode.stop().catch(() => {});
        },
        () => {}
      );
    } catch (err: unknown) {
      toast({
        title: "Error de cámara",
        description: (err as Error).message || "No se pudo iniciar la cámara",
        variant: "destructive",
      });
    }
  }, [scanItemMutation, toast]);

  const stopInlineScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
    setScannerItemId(null);
    setManualBarcode("");
  }, []);

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current.clear().catch(() => {});
      }
    };
  }, []);

  const handleManualScan = (itemId: string) => {
    if (!manualBarcode.trim()) return;
    scanItemMutation.mutate({ itemId, barcode: manualBarcode.trim() });
  };

  // ── Tab helpers ──────────────────────────────────────────────────────────────
  const openOrderDetail = (orderId: string) => {
    setSelectedOrderId(orderId);
    setTab("detail");
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center">
              <PackageCheck className="w-6 h-6 text-teal-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Preparación de Pedidos</h1>
              <p className="text-slate-500 text-sm">Gestión de órdenes de picking</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { id: "create" as const, label: "Crear Orden", icon: Plus },
            { id: "orders" as const, label: "Órdenes Activas", icon: ListTodo },
            { id: "detail" as const, label: "Detalle de Orden", icon: Eye },
          ].map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-white text-teal-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                disabled={t.id === "detail" && !selectedOrderId && isActive !== (tab === "detail")}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB: Create Order ─────────────────────────────────────────────────── */}
        {tab === "create" && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-700">Seleccionar Productos</h2>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowProductDialog(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Agregar Producto
                </Button>
              </div>

              {selectedProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-400">
                  <Package className="w-10 h-10" />
                  <p className="text-sm">No hay productos seleccionados</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowProductDialog(true)}
                    className="gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar productos a la orden
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead className="font-semibold text-slate-600 w-24">Código</TableHead>
                        <TableHead className="font-semibold text-slate-600">Producto</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-24 text-right">Stock Disp.</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-24 text-right">Cantidad</TableHead>
                        <TableHead className="font-semibold text-slate-600 w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((item) => (
                        <TableRow key={item.productId} className="hover:bg-slate-50/70">
                          <TableCell className="font-mono text-xs text-slate-600">
                            {item.productCode}
                          </TableCell>
                          <TableCell className="text-sm text-slate-800">{item.productName}</TableCell>
                          <TableCell className="text-right text-sm text-slate-500">
                            {item.maxStock}
                          </TableCell>
                          <TableCell className="text-right">
                            <input
                              type="number"
                              min={1}
                              max={item.maxStock}
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.productId, parseInt(e.target.value) || 1)}
                              className="w-20 h-8 text-center text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                            />
                          </TableCell>
                          <TableCell>
                            <button
                              onClick={() => removeProduct(item.productId)}
                              className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                              aria-label={`Eliminar ${item.productName}`}
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {selectedProducts.length > 0 && (
                <div className="flex justify-end mt-4 pt-4 border-t border-slate-100">
                  <Button
                    onClick={handleCreateOrder}
                    className="gap-2"
                    disabled={createOrderMutation.isPending}
                  >
                    {createOrderMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ClipboardList className="w-4 h-4" />
                    )}
                    Crear Orden de Picking ({selectedProducts.length} productos)
                  </Button>
                </div>
              )}
            </div>

            {/* Product picker dialog */}
            <Dialog open={showProductDialog} onOpenChange={setShowProductDialog}>
              <DialogContent className="sm:max-w-xl max-w-[95vw] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Seleccionar Productos</DialogTitle>
                </DialogHeader>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar por código o nombre..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                  {filteredProducts.map((p) => {
                    const isSelected = selectedProducts.some((sp) => sp.productId === p.id);
                    return (
                      <div
                        key={p.id}
                        className={`flex items-center justify-between py-2.5 px-1 ${
                          isSelected ? "bg-teal-50/50" : ""
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-xs text-slate-500">{p.code}</span>
                            <Badge variant="outline" className="text-xs">{p.category}</Badge>
                            <span className="text-xs text-slate-400">Stock: {p.stock}</span>
                          </div>
                        </div>
                        <Button
                          variant={isSelected ? "outline" : "default"}
                          size="sm"
                          className="ml-3 flex-shrink-0"
                          onClick={() => addProduct(p)}
                          disabled={p.stock <= 0}
                        >
                          {isSelected ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Agregado
                            </>
                          ) : (
                            <Plus className="w-3.5 h-3.5 mr-1" />
                          )}
                          {p.stock > 0 ? "Agregar" : "Sin stock"}
                        </Button>
                      </div>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <div className="py-8 text-center text-slate-400 text-sm">
                      No se encontraron productos
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── TAB: Orders ──────────────────────────────────────────────────────── */}
        {tab === "orders" && (
          <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                Cargando órdenes...
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                <PackageCheck className="w-10 h-10" />
                <p className="text-sm font-medium">No hay órdenes de picking</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTab("create")}
                  className="gap-1.5 mt-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Crear primera orden
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold text-slate-600 w-28">Orden #</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-24">Estado</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-24">Items</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-24">Progreso</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-32">Creada</TableHead>
                      <TableHead className="font-semibold text-slate-600 w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.map((order) => {
                      const totalItems = order.items?.length ?? 0;
                      const pickedItems = order.items?.filter((i) => i.scanned).length ?? 0;
                      const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
                      return (
                        <TableRow key={order.id} className="hover:bg-slate-50/70">
                          <TableCell className="font-mono text-xs font-medium text-slate-800">
                            {order.orderNumber}
                          </TableCell>
                          <TableCell>
                            <span
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">{totalItems}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-teal-500 transition-all"
                                  style={{
                                    width: totalItems > 0 ? `${(pickedItems / totalItems) * 100}%` : "0%",
                                  }}
                                />
                              </div>
                              <span className="text-xs text-slate-500">
                                {pickedItems}/{totalItems}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {new Date(order.createdAt).toLocaleString("es-PE")}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openOrderDetail(order.id)}
                              className="gap-1 text-teal-600"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Order Detail ────────────────────────────────────────────────── */}
        {tab === "detail" && (
          <>
            {!selectedOrder ? (
              <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
                <div className="flex flex-col items-center gap-3 text-slate-400">
                  <Eye className="w-10 h-10" />
                  <p className="text-sm font-medium">Selecciona una orden de la lista de órdenes activas</p>
                  <Button variant="outline" size="sm" onClick={() => setTab("orders")} className="gap-1.5 min-h-[44px]">
                    <ListTodo className="w-3.5 h-3.5" />
                    Ver órdenes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Order Header */}
                <div className="bg-white rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <h2 className="text-lg font-bold text-slate-900">
                          Orden #{selectedOrder.orderNumber}
                        </h2>
                        {(() => {
                          const cfg = STATUS_CONFIG[selectedOrder.status] ?? STATUS_CONFIG.pending;
                          return (
                            <span
                              className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
                              style={{ backgroundColor: cfg.bg, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        Creada: {new Date(selectedOrder.createdAt).toLocaleString("es-PE")}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setTab("orders")}
                      className="gap-1.5"
                    >
                      <ListTodo className="w-3.5 h-3.5" />
                      Volver a órdenes
                    </Button>
                  </div>

                  {/* Progress */}
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-500">Progreso</span>
                      <span className="text-xs font-medium text-slate-700">
                        {selectedOrder.items?.filter((i) => i.scanned).length ?? 0} de{" "}
                        {selectedOrder.items?.length ?? 0} items
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-500 transition-all"
                        style={{
                          width:
                            (selectedOrder.items?.length ?? 0) > 0
                              ? `${((selectedOrder.items?.filter((i) => i.scanned).length ?? 0) / (selectedOrder.items?.length ?? 1)) * 100}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Items sorted by location */}
                <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-slate-700">
                      Items de la Orden
                    </h3>
                  </div>
                  {!selectedOrder.items || selectedOrder.items.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                      No hay items en esta orden
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {[...(selectedOrder.items ?? [])]
                        .sort((a, b) => {
                          const locA = `${a.warehouse ?? ""}${a.rack ?? ""}${a.shelf ?? ""}`;
                          const locB = `${b.warehouse ?? ""}${b.rack ?? ""}${b.shelf ?? ""}`;
                          return locA.localeCompare(locB);
                        })
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`px-4 py-3 ${
                              item.scanned ? "bg-emerald-50/50" : ""
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-slate-800">
                                    {item.productName}
                                  </p>
                                  {item.scanned && (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="font-mono text-xs text-slate-500">
                                    {item.productCode}
                                  </span>
                                  <span className="text-xs text-slate-400">
                                    Cant: {item.quantity}
                                  </span>
                                  {item.scanned && item.scannedAt && (
                                    <span className="text-xs text-emerald-600 flex items-center gap-0.5">
                                      <Clock className="w-3 h-3" />
                                      {new Date(item.scannedAt).toLocaleTimeString("es-PE")}
                                    </span>
                                  )}
                                </div>
                                {(item.warehouse || item.rack || item.shelf) && (
                                  <div className="flex items-center gap-1 mt-1 text-xs text-slate-400">
                                    <Package className="w-3 h-3" />
                                    {[item.warehouse, item.zone, item.rack, item.shelf, item.position]
                                      .filter(Boolean)
                                      .join(" / ")}
                                  </div>
                                )}
                              </div>
                              <div className="flex-shrink-0">
                                {item.scanned ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Picking OK
                                  </span>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-1.5 text-amber-600 border-amber-200"
                                    onClick={() => startInlineScanner(item.id)}
                                  >
                                    <Scan className="w-3.5 h-3.5" />
                                    Escanear
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Inline scanner */}
                            {scannerItemId === item.id && (
                              <div className="mt-3 pt-3 border-t border-slate-100">
                                <div
                                  ref={scannerItemId === item.id ? scannerRef : undefined}
                                  id={`picking-scanner-${item.id}`}
                                  className="bg-slate-50 rounded-lg overflow-hidden relative"
                                  style={{ minHeight: "200px" }}
                                >
                                  <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                    <Scan className="w-6 h-6 animate-pulse" />
                                  </div>
                                </div>
                                <div className="flex gap-2 mt-2">
                                  <input
                                    type="text"
                                    value={manualBarcode}
                                    onChange={(e) => setManualBarcode(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleManualScan(item.id)}
                                    placeholder="O ingresa código manualmente..."
                                    className="flex-1 h-8 px-2.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                                  />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleManualScan(item.id)}
                                    disabled={scanItemMutation.isPending}
                                    className="min-h-[44px]"
                                  >
                                    {scanItemMutation.isPending ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <ArrowRight className="w-3 h-3" />
                                    )}
                                    Validar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={stopInlineScanner}
                                    className="text-slate-400"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
