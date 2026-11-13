import React, { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

export function ClientOnly({
  children,
  fallback = null,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const isHydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return <>{isHydrated ? children : fallback}</>;
}
