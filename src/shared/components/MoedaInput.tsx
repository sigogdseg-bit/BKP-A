import { useState, useEffect } from "react";

function formatarMoeda(val: number | undefined | null): string {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return "0,00";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseMoeda(texto: string): number {
  if (!texto) return 0;
  const limpo = texto.replace(/[^\d.,]/g, "");
  if (limpo.includes(",")) {
    const semMilhar = limpo.replace(/\./g, "").replace(",", ".");
    const num = parseFloat(semMilhar);
    return isNaN(num) || num < 0 ? 0 : num;
  }
  const num = parseFloat(limpo);
  return isNaN(num) || num < 0 ? 0 : num;
}

interface MoedaInputProps {
  id?: string;
  value: number;
  onChange: (val: number) => void;
  className?: string;
  placeholder?: string;
  title?: string;
  disabled?: boolean;
  onBlur?: () => void;
}

export function MoedaInput({
  id,
  value,
  onChange,
  className = "",
  placeholder = "0,00",
  title,
  disabled = false,
  onBlur,
}: MoedaInputProps) {
  const [texto, setTexto] = useState(() => formatarMoeda(value));
  const [focado, setFocado] = useState(false);

  useEffect(() => {
    if (!focado) {
      setTexto(formatarMoeda(value));
    }
  }, [value, focado]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/[^\d.,]/g, "");
    setTexto(raw);
    const n = parseMoeda(raw);
    onChange(n);
  };

  const handleBlur = () => {
    setFocado(false);
    const n = parseMoeda(texto);
    setTexto(formatarMoeda(n));
    onChange(n);
    if (onBlur) {
      onBlur();
    }
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setFocado(true);
    e.target.select();
  };

  return (
    <input
      id={id}
      type="text"
      inputMode="decimal"
      value={texto}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      placeholder={placeholder}
      title={title}
      disabled={disabled}
      className={className}
    />
  );
}
