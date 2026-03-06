import React from "react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** When true, centers the spinner in a full container */
  fullPage?: boolean;
}

const sizeMap = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-10 w-10 border-[3px]",
};

export function Spinner({ size = "md", className, fullPage = false }: SpinnerProps) {
  const spinner = (
    <div
      className={cn(
        "animate-spin rounded-full border-blue-600 border-t-transparent dark:border-blue-400 dark:border-t-transparent",
        sizeMap[size],
        className,
      )}
    />
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">{spinner}</div>
    );
  }

  return spinner;
}
