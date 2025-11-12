"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { LogoIcon } from "@/components/Logo";
import { signOut } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  items: NavItem[];
  userInitial: string;
}

export default function Sidebar({ items, userInitial }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();

  // Обновляем отступ контента при изменении состояния sidebar
  useEffect(() => {
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      if (isCollapsed) {
        mainContent.classList.remove('md:pl-64');
        mainContent.classList.add('md:pl-16');
      } else {
        mainContent.classList.remove('md:pl-16');
        mainContent.classList.add('md:pl-64');
      }
    }
  }, [isCollapsed]);

  return (
    <aside
      className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 transition-all duration-300 ${
        isCollapsed ? "md:w-16" : "md:w-64"
      }`}
    >
      <div className="flex flex-col flex-grow border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {/* Logo */}
        <div className="flex items-center flex-shrink-0 px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 ${isCollapsed ? "justify-center" : ""}`}
          >
            <LogoIcon className="h-8 w-8" size="sm" />
            {!isCollapsed && (
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                MyUnion
              </span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className={`flex-1 py-4 space-y-2 overflow-y-auto ${isCollapsed ? "px-3" : "px-4"}`}>
          {items.map((item) => {
            const isActive = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === item.href || pathname.startsWith(item.href + "/");

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                } ${
                  isCollapsed
                    ? "h-10 w-10 justify-center"
                    : "px-3 py-2.5"
                }`}
                title={isCollapsed ? item.label : undefined}
              >
                <span className="flex-shrink-0">{item.icon}</span>
                {!isCollapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

          {/* Bottom section */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
            {/* Collapse button */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`w-full px-4 py-3 flex items-center gap-3 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors ${isCollapsed ? "justify-center" : ""}`}
              title={isCollapsed ? "Развернуть меню" : "Свернуть меню"}
            >
              <svg
                className={`h-5 w-5 transition-transform ${isCollapsed ? "" : "rotate-180"}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              {!isCollapsed && <span>Свернуть меню</span>}
            </button>

            {/* Actions row */}
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
              <div className={`flex items-center gap-2 ${isCollapsed ? "flex-col" : "justify-between"}`}>
                {/* Account icon */}
                <Link
                  href="/dashboard/profile"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title={isCollapsed ? "Профиль" : undefined}
                >
                  <span className="text-sm font-semibold">{userInitial}</span>
                </Link>

                {/* Theme toggle */}
                <ThemeToggle collapsed={isCollapsed} />

                {/* Sign out */}
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title={isCollapsed ? "Выйти" : undefined}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>
      </div>
    </aside>
  );
}

