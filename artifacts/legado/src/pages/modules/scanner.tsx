import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Scan,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Barcode,
  Package,
  Warehouse,
  MapPin,
  QrCode,
  Camera,
  CameraOff, Search,
  RefreshCw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface BarcodeProduct {
  id: string;
  code: string;
  name: string;
  category: string;
  stock: number;
  unit: string;
  barcode: string;
  location?: string;
  warehouse?: string;
}

interface ScannedResult {
  product: BarcodeProduct;
  location?: {
    warehouse: string;
    zone: string;
    rack: string;
    shelf: string;
    position: string;
  };
}

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

export default function ScannerPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [scannerReady, setScannerReady] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [scanResult, setScanResult] = useState<ScannedResult | null>(null);
  const [scanError, setScanError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [manualBarcode, setManualBarcode] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);

  const canWrite = user?.role && ["admin", "supervisor", "operator"].includes(user.role);

  // Fetch product by barcode
  const lookupBarcode = useCallback(async (barcode: string) => {
    setScanError("");
    setScanResult(null);
    try {
      const data = await api(`/api/barcode/by-barcode/${encodeURIComponent(barcode)}`);
      setScanResult(data);
    } catch (err: unknown) {
      setScanError((err as Error).message || "Código de barras no encontrado");
    }
  }, []);

  // Generate barcode for a product
  const generateMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      const res = await fetch(`${BASE}/api/barcode/generate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ code: scannedCode || manualBarcode }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? "Error al generar código de barras");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Código generado", description: "El código de barras fue generado exitosamente." });
      qc.invalidateQueries({ queryKey: ["/api/barcode"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setIsGenerating(false),
  });

  // Initialize scanner
  const startScanner = useCallback(async () => {
    setCameraError("");
    setScanResult(null);
    setScanError("");

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (html5QrCodeRef.current) {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      }

      const scannerId = "html5qr-scanner";
      if (!document.getElementById(scannerId)) {
        const div = document.createElement("div");
        div.id = scannerId;
        if (scannerRef.current) {
          scannerRef.current.innerHTML = "";
          scannerRef.current.appendChild(div);
        }
      }

      const html5QrCode = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText: string) => {
          setScannedCode(decodedText);
          lookupBarcode(decodedText);
          // Stop scanner after successful scan
          html5QrCode.stop().catch(() => {});
          setScannerActive(false);
        },
        () => {
          // QR scan error - ignore (continues scanning)
        }
      );
      setScannerActive(true);
    } catch (err: unknown) {
      const msg = (err as Error).message || "Error al iniciar la cámara";
      setCameraError(msg);
      toast({ title: "Error de cámara", description: msg, variant: "destructive" });
    }
  }, [lookupBarcode, toast]);

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        await html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
    setScannerActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleManualLookup = () => {
    if (!manualBarcode.trim()) return;
    setScannedCode(manualBarcode.trim());
    lookupBarcode(manualBarcode.trim());
  };

  const handleGenerateBarcode = () => {
    generateMutation.mutate();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center">
              <Scan className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Escáner de Códigos de Barras</h1>
              <p className="text-slate-500 text-sm">Escanea productos para consultar información y ubicación</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Scanner Column */}
          <div className="space-y-4">
            {/* Camera Scanner */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-500" />
                  Escáner de Cámara
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div
                  ref={scannerRef}
                  className="bg-slate-100 rounded-lg overflow-hidden relative"
                  style={{ minHeight: "280px" }}
                >
                  {!scannerActive && !cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 p-4">
                      <Camera className="w-12 h-12" />
                      <p className="text-sm text-center">
                        Presiona "Iniciar Escáner" para activar la cámara
                      </p>
                    </div>
                  )}
                  {cameraError && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400 p-4">
                      <CameraOff className="w-12 h-12" />
                      <p className="text-sm text-center text-red-500">{cameraError}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  {!scannerActive ? (
                    <Button onClick={startScanner} className="gap-2 w-full" size="sm">
                      <Camera className="w-4 h-4" />
                      Iniciar Escáner
                    </Button>
                  ) : (
                    <Button onClick={stopScanner} variant="outline" className="gap-2 w-full" size="sm">
                      <CameraOff className="w-4 h-4" />
                      Detener Escáner
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Manual Entry */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <QrCode className="w-4 h-4 text-slate-500" />
                  Ingreso Manual
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleManualLookup()}
                    placeholder="Ingresa código de barras..."
                    className="flex-1 h-9 px-3 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400"
                  />
                  <Button onClick={handleManualLookup} size="sm" className="gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    Buscar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Actions */}
            {canWrite && scannedCode && !scanResult && !scanError && (
              <Card>
                <CardContent className="pt-4">
                  <Button onClick={handleGenerateBarcode} className="gap-2 w-full" size="sm" disabled={isGenerating}>
                    {isGenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Barcode className="w-4 h-4" />
                    )}
                    Generar Código de Barras
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Results Column */}
          <div className="space-y-4">
            {scanError && (
              <Card className="border-red-200 bg-red-50">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-red-700 text-sm">Producto no encontrado</p>
                      <p className="text-sm text-red-600 mt-1">{scanError}</p>
                      <p className="text-xs text-red-500 mt-2">
                        Código escaneado: <strong>{scannedCode}</strong>
                      </p>
                      {canWrite && (
                        <Button
                          onClick={handleGenerateBarcode}
                          variant="outline"
                          size="sm"
                          className="mt-3 gap-1.5 border-red-300 text-red-600"
                          disabled={isGenerating}
                        >
                          {isGenerating ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Barcode className="w-3.5 h-3.5" />
                          )}
                          Generar código de barras
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {scanResult && (
              <>
                {/* Product Info */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="w-4 h-4 text-emerald-500" />
                      Información del Producto
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Código</span>
                        <span className="font-mono text-sm font-medium text-slate-900">
                          {scanResult.product.code}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Nombre</span>
                        <span className="text-sm font-medium text-slate-900 text-right max-w-[60%]">
                          {scanResult.product.name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Categoría</span>
                        <Badge variant="outline" className="text-xs">
                          {scanResult.product.category}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Stock</span>
                        <span className="text-sm font-semibold text-emerald-600">
                          {scanResult.product.stock} {scanResult.product.unit}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">Código Barras</span>
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded">
                          {scanResult.product.barcode}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          <span className="text-sm text-emerald-700 font-medium">
                            Producto encontrado exitosamente
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Location Info */}
                {scanResult.location && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-amber-500" />
                        Ubicación en Almacén
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">
                            <Warehouse className="w-3 h-3 inline mr-1" />
                            Almacén
                          </p>
                          <p className="text-sm font-semibold text-slate-800">
                            {scanResult.location.warehouse}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Zona</p>
                          <p className="text-sm font-semibold text-slate-800">
                            {scanResult.location.zone}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Rack</p>
                          <p className="text-sm font-semibold text-slate-800">
                            {scanResult.location.rack}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Estante</p>
                          <p className="text-sm font-semibold text-slate-800">
                            {scanResult.location.shelf}
                          </p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-3 col-span-2">
                          <p className="text-xs text-slate-500 mb-1">Posición</p>
                          <p className="text-sm font-semibold text-slate-800">
                            {scanResult.location.position}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            )}

            {!scanResult && !scanError && (
              <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
                <CardContent className="py-12">
                  <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
                    <Barcode className="w-16 h-16" />
                    <p className="text-sm font-medium">Escanea o ingresa un código de barras</p>
                    <p className="text-xs text-slate-400 text-center max-w-sm">
                      Los resultados del producto y su ubicación se mostrarán aquí
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
