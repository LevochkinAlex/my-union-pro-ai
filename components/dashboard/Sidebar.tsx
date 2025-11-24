"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { LogoIcon } from "@/components/Logo";
import ChatMenu from "@/components/dashboard/ChatMenu";
import { signOut } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  subItems?: { href: string; label: string }[];
}

interface SidebarProps {
  items: NavItem[];
  userInitial: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export default function Sidebar({ items, userInitial, avatarUrl, isAdmin = false }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
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
            href={isAdmin ? "/admin/dashboard" : "/dashboard"}
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
          {/* Chat menu with history and appeals - только для обычных пользователей */}
          {!isAdmin && <ChatMenu isCollapsed={isCollapsed} />}

          {/* Other menu items */}
          {items.map((item) => {
            // Skip AI Chat item since it's now in ChatMenu
            if (item.href === "/dashboard" && item.label === "AI Чат") {
              return null;
            }

            const hasSubItems = item.subItems && item.subItems.length > 0;
            
            // Check if any sub-item is active
            const isSubItemActive = hasSubItems && item.subItems!.some(
              (subItem) => pathname === subItem.href || pathname.startsWith(subItem.href + "/")
            );
            
            // Main item is active ONLY if we're exactly on it AND it's not duplicated in sub-items
            // This prevents double highlighting when a sub-item is active
            const isMainItemActive = !isSubItemActive && pathname === item.href;
            
            // Show as active if main item is active OR any sub-item is active
            const isActive = isMainItemActive || isSubItemActive;
            
            // Auto-expand if any sub-item is active
            const isExpanded = expandedItems.includes(item.href) || isSubItemActive;

            return (
              <div key={item.href}>
                {/* Main item */}
                {hasSubItems ? (
                  <button
                    onClick={() => {
                      if (isCollapsed) {
                        // If collapsed, navigate to main item
                        window.location.href = item.href;
                      } else {
                        // If expanded, toggle submenu
                        setExpandedItems(prev =>
                          prev.includes(item.href)
                            ? prev.filter(h => h !== item.href)
                            : [...prev, item.href]
                        );
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg text-sm font-medium transition-colors ${
                      isMainItemActive
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
                    {!isCollapsed && (
                      <>
                        <span className="flex-1 text-left">{item.label}</span>
                        <svg
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </>
                    )}
                  </button>
                ) : (
                  <Link
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
                )}

                {/* Sub items */}
                {hasSubItems && isExpanded && !isCollapsed && (
                  <div className="mt-1 ml-3 space-y-1 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
                    {item.subItems!.map((subItem) => {
                      // Exact match or child pages of this specific sub-item
                      // But NOT if it matches another sub-item's path
                      const isExactMatch = pathname === subItem.href;
                      const isChildPage = pathname.startsWith(subItem.href + "/") && 
                                         !item.subItems!.some(other => 
                                           other.href !== subItem.href && 
                                           (pathname === other.href || pathname.startsWith(other.href + "/"))
                                         );
                      const subIsActive = isExactMatch || isChildPage;
                      
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                            subIsActive
                              ? "bg-blue-50 font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                              : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-700/50"
                          }`}
                        >
                          {subItem.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

          {/* Bottom section */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
            {/* Version info */}
            {!isCollapsed && (
              <div className="px-4 py-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Версия {process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}
                </p>
              </div>
            )}
            
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
                  href={isAdmin ? "/admin/users" : "/dashboard/profile"}
                  className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                  title={isCollapsed ? (isAdmin ? "Пользователи" : "Профиль") : undefined}
                >
                  {avatarUrl ? (
                    <img 
                      src={avatarUrl} 
                      alt="Avatar" 
                      className="h-full w-full object-cover"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        // Если изображение не загрузилось, скрываем его и показываем плейсхолдер
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = `<span class="text-sm font-semibold">${userInitial}</span>`;
                        }
                      }}
                    />
                  ) : (
                    <span className="text-sm font-semibold">{userInitial}</span>
                  )}
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

