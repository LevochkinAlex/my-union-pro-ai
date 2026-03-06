import React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Right-side actions (buttons, etc.) */
  actions?: React.ReactNode;
  /** Optional icon before the title */
  icon?: React.ReactNode;
  className?: string;
  /** Content below the title row (tabs, filters, etc.) */
  children?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  actions,
  icon,
  className,
  children,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex-shrink-0 text-gray-400 dark:text-gray-500">{icon}</span>
            )}
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{title}</h1>
          </div>
          {description && (
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
