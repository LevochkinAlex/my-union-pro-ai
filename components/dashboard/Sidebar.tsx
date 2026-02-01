"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { LogoIcon } from "@/components/Logo";
import { signOut } from "next-auth/react";
import ViewModeSwitch from "./ViewModeSwitch";
import ChatUnreadBadge from "./ChatUnreadBadge";
import NotificationUnreadBadge from "./NotificationUnreadBadge";
import { useTour } from "./TourGuideProvider";

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
  const [manuallyCollapsed, setManuallyCollapsed] = useState<string[]>([]); // Пункты, которые пользователь вручную свернул
  const [isNavigating, setIsNavigating] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openTour } = useTour();
  const fullPath = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");

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

  // Сбрасываем manuallyCollapsed при смене страницы (если перешли на другую секцию)
  useEffect(() => {
    setManuallyCollapsed([]);
  }, [pathname]);

  return (
    <aside
      data-tour="sidebar"
      className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 transition-all duration-300 ${
        isCollapsed ? "md:w-16" : "md:w-64"
      }`}
    >
      <div className="flex flex-col h-full border-r border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {/* Logo - фиксированный верх */}
        <div className="flex-shrink-0 flex items-center px-4 py-4 border-b border-gray-200 dark:border-gray-700">
          <Link
            href={isAdmin ? "/admin/dashboard" : "/dashboard"}
            prefetch={false}
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

        {/* Navigation - скроллируемая область */}
        <nav className={`flex-1 min-h-0 py-2 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 ${isCollapsed ? "px-1 flex flex-col items-center" : "px-3"}`}>
          {/* View Mode Switch - в начале меню для пользователей с двойной ролью */}
          {!isAdmin && (
            <ViewModeSwitch collapsed={isCollapsed} />
          )}
          
          {/* Menu items */}
          {items.map((item) => {

            const hasSubItems = item.subItems && item.subItems.length > 0;
            
            // Check if any sub-item is active (pathname + query for same-path sub-items)
            const isSubItemActive = hasSubItems && item.subItems!.some(
              (subItem) => {
                const hrefPath = subItem.href.split("?")[0];
                const hrefQuery = subItem.href.includes("?") ? subItem.href.split("?")[1] : "";
                if (pathname !== hrefPath) return pathname.startsWith(subItem.href + "/");
                if (!hrefQuery) return pathname === subItem.href;
                return fullPath === subItem.href;
              }
            );
            
            // Main item is active ONLY if we're exactly on it AND it's not duplicated in sub-items
            // This prevents double highlighting when a sub-item is active
            const isMainItemActive = !isSubItemActive && pathname === item.href;
            
            // Show as active if main item is active OR any sub-item is active
            const isActive = isMainItemActive || isSubItemActive;
            
            // Auto-expand if any sub-item is active, but respect manual collapse
            const isAutoExpanded = isSubItemActive && !manuallyCollapsed.includes(item.href);
            const isExpanded = expandedItems.includes(item.href) || isAutoExpanded;

            return (
              <div key={item.href}>
                {/* Main item */}
                {hasSubItems ? (
                  <button
                    onClick={() => {
                      if (isNavigating) return; // Prevent double clicks
                      
                      if (isCollapsed) {
                        // If collapsed, navigate to main item using Next.js router
                        setIsNavigating(true);
                        router.push(item.href);
                        setTimeout(() => setIsNavigating(false), 500);
                      } else {
                        // If expanded, toggle submenu
                        if (isExpanded) {
                          // Сворачиваем
                          setExpandedItems(prev => prev.filter(h => h !== item.href));
                          // Запоминаем что пользователь вручную свернул
                          if (isSubItemActive) {
                            setManuallyCollapsed(prev => [...prev, item.href]);
                          }
                        } else {
                          // Разворачиваем
                          setExpandedItems(prev => [...prev, item.href]);
                          setManuallyCollapsed(prev => prev.filter(h => h !== item.href));
                        }
                      }
                    }}
                    disabled={isNavigating}
                    className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isMainItemActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                    } ${
                      isCollapsed
                        ? "h-10 w-10 justify-center"
                        : "w-full px-2.5 py-2"
                    }`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className="flex-shrink-0 relative">
                      {item.icon}
                      {(item.href === '/dashboard/chat' || item.href === '/dashboard/chats/ppo-head') && <ChatUnreadBadge />}
                      {item.href === '/dashboard/notifications' && <NotificationUnreadBadge />}
                    </span>
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
                    prefetch={false}
                    onClick={(e) => {
                      if (isNavigating) {
                        e.preventDefault();
                        return;
                      }
                      setIsNavigating(true);
                      setTimeout(() => setIsNavigating(false), 500);
                    }}
                    className={`flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700"
                    } ${
                      isCollapsed
                        ? "h-10 w-10 justify-center"
                        : "w-full px-2.5 py-2"
                    } ${isNavigating ? "pointer-events-none opacity-70" : ""}`}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <span className="flex-shrink-0 relative">
                      {item.icon}
                      {(item.href === '/dashboard/chat' || item.href === '/dashboard/chats/ppo-head') && <ChatUnreadBadge />}
                      {item.href === '/dashboard/notifications' && <NotificationUnreadBadge />}
                    </span>
                    {!isCollapsed && <span>{item.label}</span>}
                  </Link>
                )}

                {/* Sub items */}
                {hasSubItems && isExpanded && !isCollapsed && (
                  <div className="mt-0.5 ml-2.5 space-y-0.5 border-l-2 border-gray-200 pl-3 dark:border-gray-700">
                    {item.subItems!.map((subItem) => {
                      const hrefPath = subItem.href.split("?")[0];
                      const hasQuery = subItem.href.includes("?");
                      const isExactMatch = hasQuery
                        ? fullPath === subItem.href
                        : pathname === subItem.href;
                      const isChildPage = pathname.startsWith(hrefPath + "/") &&
                                         !item.subItems!.some(other =>
                                           other.href !== subItem.href &&
                                           (pathname === other.href.split("?")[0] || pathname.startsWith(other.href.split("?")[0] + "/"))
                                         );
                      const subIsActive = isExactMatch || isChildPage;
                      
                      return (
                        <Link
                          key={subItem.href}
                          href={subItem.href}
                          prefetch={false}
                          onClick={(e) => {
                            if (isNavigating) {
                              e.preventDefault();
                              return;
                            }
                            setIsNavigating(true);
                            setTimeout(() => setIsNavigating(false), 500);
                          }}
                          className={`block rounded-md px-2.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                            subIsActive
                              ? "bg-blue-100 font-medium text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                              : "text-gray-600 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700/50"
                          } ${isNavigating ? "pointer-events-none opacity-70" : ""}`}
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

          {/* Путеводитель по платформе — не в разделе Настройки, отдельный пункт в меню */}
          {!isAdmin && (
            <div className="mt-1 pt-1 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => openTour()}
                className={`flex items-center gap-2.5 rounded-lg text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-300 dark:hover:bg-gray-700 ${
                  isCollapsed ? "h-10 w-10 justify-center px-0" : "w-full px-2.5 py-2"
                }`}
                title="Путеводитель"
              >
                <span className="flex-shrink-0">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </span>
                {!isCollapsed && <span>Путеводитель</span>}
              </button>
            </div>
          )}
        </nav>

          {/* Bottom section - компактная версия */}
          <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700">
            {/* Version - только в развернутом режиме */}
            {!isCollapsed && (
              <div className="px-3 py-1">
                <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
                  v{process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0'}
                </p>
              </div>
            )}

            {/* Actions row */}
            <div className={`${isCollapsed ? "px-1 py-2" : "px-3 py-2"}`}>
              {isCollapsed ? (
                /* Свернутый режим: кнопка разворачивания + меню "три точки" */
                <div className="flex flex-col items-center gap-2">
                  {/* Collapse button - всегда первый и видимый */}
                  <button
                    onClick={() => setIsCollapsed(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700 transition-colors"
                    title="Развернуть меню"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* More menu button */}
                  <div className="relative">
                    <button
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                      title="Ещё"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>

                    {/* Dropdown menu */}
                    {showMoreMenu && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                        <div className="absolute left-full bottom-0 ml-2 z-50 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
                          {/* Profile */}
                          <Link
                            href={isAdmin ? "/admin/users" : "/dashboard/profile"}
                            prefetch={false}
                            onClick={() => setShowMoreMenu(false)}
                            className="flex items-center gap-3 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <div className="flex h-8 w-8 items-center justify-center rounded-full overflow-hidden bg-gray-200 dark:bg-gray-600">
                              {avatarUrl ? (
                                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-xs font-semibold">{userInitial}</span>
                              )}
                            </div>
                            <span>Профиль</span>
                          </Link>
                          
                          {/* Theme toggle */}
                          <div className="px-3 py-2 flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300">
                            <ThemeToggle collapsed={false} />
                          </div>
                          
                          <hr className="my-1 border-gray-200 dark:border-gray-700" />
                          
                          {/* Sign out */}
                          <button
                            onClick={() => {
                              setShowMoreMenu(false);
                              signOut({ callbackUrl: "/login" });
                            }}
                            className="flex w-full items-center gap-3 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                            </svg>
                            <span>Выйти</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                /* Развернутый режим: все кнопки в ряд */
                <div className="flex items-center justify-between gap-1">
                  {/* Account icon */}
                  <Link
                    href={isAdmin ? "/admin/users" : "/dashboard/profile"}
                    prefetch={false}
                    className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                    title="Профиль"
                  >
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt="Avatar" 
                        className="h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = `<span class="text-xs font-semibold">${userInitial}</span>`;
                          }
                        }}
                      />
                    ) : (
                      <span className="text-xs font-semibold">{userInitial}</span>
                    )}
                  </Link>

                  {/* Theme toggle */}
                  <ThemeToggle collapsed={false} />

                  {/* Collapse button */}
                  <button
                    onClick={() => setIsCollapsed(true)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                    title="Свернуть"
                  >
                    <svg className="h-4 w-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Sign out */}
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-gray-700 shadow-sm hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
                    title="Выйти"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
      </div>
    </aside>
  );
}

