import React from "react";
import { cn } from "@/lib/utils";

type BadgeColor = "green" | "yellow" | "red" | "blue" | "gray" | "purple" | "orange";

const colorMap: Record<BadgeColor, string> = {
  green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
};

interface StatusBadgeProps {
  children: React.ReactNode;
  color?: BadgeColor;
  /** Dot indicator before text */
  dot?: boolean;
  className?: string;
}

export function StatusBadge({
  children,
  color = "gray",
  dot = false,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorMap[color],
        className,
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 rounded-full", {
            "bg-green-500": color === "green",
            "bg-yellow-500": color === "yellow",
            "bg-red-500": color === "red",
            "bg-blue-500": color === "blue",
            "bg-gray-500": color === "gray",
            "bg-purple-500": color === "purple",
            "bg-orange-500": color === "orange",
          })}
        />
      )}
      {children}
    </span>
  );
}
