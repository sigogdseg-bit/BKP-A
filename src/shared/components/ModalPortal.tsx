import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalPortalProps {
  children: ReactNode;
}

/**
 * ModalPortal — Teleporta o conteúdo do modal para document.body.
 *
 * Regra Arquitetural (W3C CSS Spec):
 * Elementos com 'position: fixed' presos dentro de ancestrais com
 * 'backdrop-filter', 'transform' ou 'perspective' perdem a referência
 * da viewport e ficam truncados. O ModalPortal anula esse confinamento,
 * garantindo renderização 100% livre na janela tanto no macOS quanto no iOS.
 */
export function ModalPortal({ children }: ModalPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  return createPortal(children, document.body);
}
