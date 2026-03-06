import React from "react";
import { cn } from "@/lib/utils";

interface Column<T> {
  key: string;
  header: string;
  /** Custom render function for the cell */
  render?: (item: T, index: number) => React.ReactNode;
  /** Tailwind classes for the column (th & td) */
  className?: string;
  /** Hide on mobile */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  /** Unique key extractor per row */
  keyExtractor: (item: T, index: number) => string;
  /** Click handler for a row */
  onRowClick?: (item: T) => void;
  className?: string;
  /** Show inside a Card wrapper with rounded corners */
  card?: boolean;
  /** Sticky header */
  stickyHeader?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  className,
  card = true,
  stickyHeader = false,
}: DataTableProps<T>) {
  return (
    <div
      className={cn(
        "overflow-hidden",
        card && "rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800",
        className,
      )}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className={cn("bg-gray-50 dark:bg-gray-900/50", stickyHeader && "sticky top-0 z-10")}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400",
                    col.hideOnMobile && "hidden sm:table-cell",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {data.map((item, idx) => (
              <tr
                key={keyExtractor(item, idx)}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={cn(
                  "transition-colors",
                  onRowClick && "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-sm text-gray-700 dark:text-gray-300",
                      col.hideOnMobile && "hidden sm:table-cell",
                      col.className,
                    )}
                  >
                    {col.render
                      ? col.render(item, idx)
                      : String((item as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
