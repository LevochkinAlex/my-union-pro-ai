"use client";

import { useLayoutEffect, useRef } from "react";

interface ProgressBarFillProps {
  value: number;
  className?: string;
}

/** Заполнение полосы прогресса; ширина задаётся в CSS через --progress (без inline style в JSX). */
export function ProgressBarFill({ value, className }: ProgressBarFillProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    ref.current?.style.setProperty("--progress", `${value}%`);
  }, [value]);

  return <div ref={ref} className={className} role="presentation" />;
}
