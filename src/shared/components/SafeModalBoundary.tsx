import React, { Component, type ReactNode, type ErrorInfo } from "react";
import { ShieldAlert } from "lucide-react";
import { ModalPortal } from "./ModalPortal";

interface SafeModalBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  titulo?: string;
  onClose?: () => void;
}

interface SafeModalBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class SafeModalBoundary extends Component<SafeModalBoundaryProps, SafeModalBoundaryState> {
  constructor(props: SafeModalBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SafeModalBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      "[SafeModalBoundary] Falha capturada na renderização do modal:",
      error,
      errorInfo,
    );
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onClose) {
      this.props.onClose();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(
          this.state.error || new Error("Erro desconhecido no modal"),
          this.reset,
        );
      }

      return (
        <ModalPortal>
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 select-none">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col items-center text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {this.props.titulo || "Módulo Indisponível no Momento"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ocorreu uma instabilidade pontual ao renderizar este modal. A operação e o
                rastreamento do veículo continuam operando normalmente.
              </p>
              {this.state.error?.message && (
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 font-mono text-[10px] text-slate-600 dark:text-slate-400 max-w-full truncate">
                  {this.state.error.message}
                </div>
              )}
              <button
                type="button"
                onClick={this.reset}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </ModalPortal>
      );
    }

    return this.props.children;
  }
}
