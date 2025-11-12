"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

export default function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
      {items.map((item) => {
        // Для главной страницы (/dashboard) активна только точное совпадение
        // Для остальных страниц активна страница и её подстраницы
        const isActive = item.href === "/dashboard" 
          ? pathname === "/dashboard"
          : pathname === item.href || pathname.startsWith(item.href + "/");
        
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isActive
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

