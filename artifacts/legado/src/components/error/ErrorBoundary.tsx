import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gradient-to-b from-rose-50 to-white">
          <div className="max-w-md space-y-6">
            <div className="text-6xl">😔</div>
            <h1 className="font-serif text-3xl font-bold text-gray-900">
              Algo salió mal
            </h1>
            <p className="text-gray-500 text-[15px] leading-relaxed">
              Ocurrió un error inesperado. Tu información está segura — esto no afecta tus datos guardados.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl text-white font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: "#9d174d" }}
              >
                Recargar la página
              </button>
              <a
                href="/dashboard"
                className="px-6 py-3 rounded-xl border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
              >
                Ir al inicio
              </a>
            </div>
            {process.env.NODE_ENV === "development" && this.state.errorMessage && (
              <details className="text-left bg-gray-100 rounded-xl p-4 text-xs text-gray-500 mt-4">
                <summary className="cursor-pointer font-semibold text-gray-600 mb-2">Detalle técnico</summary>
                <pre className="whitespace-pre-wrap break-all">{this.state.errorMessage}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
