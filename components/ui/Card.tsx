import React from "react";
import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  /** No padding — for tables/lists that need edge-to-edge content */
  noPadding?: boolean;
  padding?: "sm" | "md" | "lg";
  onClick?: () => void;
  /** Hover effect for interactive cards */
  hoverable?: boolean;
  id?: string;
}

export function Card({
  children,
  className,
  noPadding = false,
  padding = "md",
  onClick,
  hoverable = false,
  id,
}: CardProps) {
  const paddingMap = { sm: "p-4", md: "p-5", lg: "p-6" };

  return (
    <div
      id={id}
      className={cn(
        "rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800",
        !noPadding && paddingMap[padding],
        hoverable &&
          "cursor-pointer transition-shadow hover:shadow-md dark:hover:border-gray-600",
        className,
      )}
      onClick={onClick}
      {...(onClick ? { role: "button" as const, tabIndex: 0 } : {})}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  children: React.ReactNode;
  className?: string;
  /** Adds bottom border separator */
  bordered?: boolean;
}

export function CardHeader({ children, className, bordered = false }: CardHeaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        bordered && "border-b border-gray-200 pb-4 dark:border-gray-700",
        className,
      )}
    >
      {children}
    </div>
  );
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  as?: "h2" | "h3" | "h4";
}

export function CardTitle({ children, className, as: Tag = "h3" }: CardTitleProps) {
  return (
    <Tag className={cn("text-lg font-semibold text-gray-900 dark:text-white", className)}>
      {children}
    </Tag>
  );
}
