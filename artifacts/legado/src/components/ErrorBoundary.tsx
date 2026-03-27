import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback UI (e.g. "Módulo de Productos") */
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — catches render-time exceptions inside any React subtree and
 * shows a friendly recovery UI instead of blanking the entire page.
 *
 * Usage:
 *   <ErrorBoundary moduleName="Productos">
 *     <ProductsPage />
 *   </ErrorBoundary>
 *
 * Root cause this was created for:
 *   Radix UI Select v2+ throws a hard Error when a <SelectItem> has value="".
 *   Without a boundary, that throw propagates to the root and blanks the app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so developers can see the full stack trace
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { moduleName = "este módulo" } = this.props;
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-slate-800">
              Error en {moduleName}
            </h2>
            <p className="text-sm text-slate-500 max-w-sm">
              Ocurrió un error inesperado al renderizar este módulo. Puedes
              intentar recargar la sección o volver al inicio.
            </p>
          </div>
          {this.state.error && (
            <details className="text-left max-w-lg w-full">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                Ver detalle técnico
              </summary>
              <pre className="mt-2 text-xs bg-slate-50 border border-slate-200 rounded-md p-3 overflow-x-auto text-red-700 whitespace-pre-wrap">
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reintentar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => (window.location.href = "/dashboard")}
            >
              Ir al inicio
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
