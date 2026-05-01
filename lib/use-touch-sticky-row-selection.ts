"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Клик по строке списка закрепляет фон как при hover ({@link touch-row-selected});
 * снимается повторным кликом по строке, кликом по другой строке или вне {@link containerRef}.
 * Работает и на тач-экранах, и на десктопе с мышью.
 */
export function useTouchStickyRowSelection() {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      const root = containerRef.current;
      const t = e.target as Node | null;
      if (!root || !t || !root.contains(t)) setSelectedKey(null);
    };

    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, []);

  const handleRowClick = useCallback((e: React.MouseEvent<HTMLElement>, key: string) => {
    if ((e.target as HTMLElement).closest("a, button, input, select, textarea, [role='button']")) return;
    setSelectedKey((prev) => (prev === key ? null : key));
  }, []);

  const getRowClassName = useCallback(
    (key: string, extra?: string) =>
      cn("hover-surface", extra, "cursor-pointer", selectedKey === key && "touch-row-selected"),
    [selectedKey]
  );

  return { containerRef, handleRowClick, getRowClassName };
}
