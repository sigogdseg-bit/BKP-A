import React, { useState, useRef, useCallback } from "react";

interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxTilt?: number;
  className?: string;
  glowRgb?: string;
  spotlightColor?: string;
  enableTilt?: boolean;
}

/**
 * TiltCard com Dinâmica Tátil 3D e Sistema de Feixe Esfumaçado Hunter
 * - Feixe esfumaçado dinâmico da cor exclusiva acompanhando o ponteiro
 * - Ponto focal de brilho translúcido seguindo o cursor
 * - Inclinação tridimensional suave (parallax tilt)
 */
export function TiltCard({
  children,
  maxTilt = 6,
  className = "",
  glowRgb = "16, 185, 129",
  spotlightColor,
  enableTilt = true,
  ...props
}: TiltCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = useState("");
  const [mousePos, setMousePos] = useState<{ x: number; y: number; opacity: number }>({
    x: 0,
    y: 0,
    opacity: 0,
  });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const card = cardRef.current;
      if (!card) return;

      const rect = card.getBoundingClientRect();
      const x = Math.round(e.clientX - rect.left);
      const y = Math.round(e.clientY - rect.top);

      if (enableTilt) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const rotateX = -((y - centerY) / centerY) * maxTilt;
        const rotateY = ((x - centerX) / centerX) * maxTilt;

        setTransformStyle(
          `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(1.015, 1.015, 1.015)`,
        );
      }

      setMousePos({ x, y, opacity: 1 });
    },
    [enableTilt, maxTilt],
  );

  const handleMouseLeave = useCallback(() => {
    if (enableTilt) {
      setTransformStyle("perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
    }
    setMousePos((prev) => ({ ...prev, opacity: 0 }));
  }, [enableTilt]);

  const primaryGlowGradient = spotlightColor
    ? `radial-gradient(320px circle at ${mousePos.x}px ${mousePos.y}px, ${spotlightColor}, transparent 80%)`
    : `radial-gradient(320px circle at ${mousePos.x}px ${mousePos.y}px, rgba(${glowRgb}, 0.25), rgba(${glowRgb}, 0.08) 40%, transparent 75%)`;

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: enableTilt ? transformStyle : undefined,
        transition: transformStyle ? "transform 0.1s ease-out" : "transform 0.4s ease-out",
        transformStyle: enableTilt ? "preserve-3d" : undefined,
      }}
      className={`relative overflow-hidden ${className}`}
      {...props}
    >
      {/* Esfumaçado dinâmico da cor exclusiva acompanhando o ponteiro do mouse */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-200"
        style={{
          opacity: mousePos.opacity,
          background: primaryGlowGradient,
        }}
      />

      {/* Ponto focal de brilho translúcido seguindo o cursor */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        style={{
          opacity: mousePos.opacity * 0.65,
          background: `radial-gradient(120px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255, 255, 255, 0.18), transparent 70%)`,
        }}
      />

      {children}
    </div>
  );
}
