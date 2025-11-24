"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import ChatMenu from "@/components/dashboard/ChatMenu";
import { LogoIcon } from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  subItems?: { href: string; label: string }[];
}

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  items: NavItem[];
  userInitial: string;
  avatarUrl?: string | null;
  isAdmin?: boolean;
}

export default function MobileMenu({
  isOpen,
  onClose,
  items,
  userInitial,
  avatarUrl,
  isAdmin = false,
}: MobileMenuProps) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [avatarError, setAvatarError] = useState(false);

  // Сбрасываем ошибку аватара при изменении avatarUrl
  useEffect(() => {
    setAvatarError(false);
  }, [avatarUrl]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "unset";
      return;
    }

    // Prevent body scroll when menu is open
    document.body.style.overflow = "hidden";

    const handleClickOutside = (event: MouseEvent) => {
      // Проверяем, что клик был вне меню и не на кнопке открытия меню
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        // Не закрываем, если клик был на кнопке меню в header
        if (!target.closest('button[aria-label="Открыть меню"]')) {
          onClose();
        }
      }
    };

    // Используем небольшую задержку, чтобы избежать закрытия при открытии
    const timeoutId = setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  // Close menu on route change
  useEffect(() => {
    if (isOpen) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close menu on Escape key
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const toggleExpanded = (href: string) => {
    setExpandedItems((prev) =>
      prev.includes(href)
        ? prev.filter((item) => item !== href)
        : [...prev, href]
    );
  };

  const isMainItemActive = (item: NavItem) => {
    if (item.href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname === item.href || pathname.startsWith(item.href + "/");
  };

  const isSubItemActive = (subItem: { href: string }) => {
    return pathname === subItem.href || pathname.startsWith(subItem.href + "/");
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Menu */}
      <div
        ref={menuRef}
        className={`fixed top-0 left-0 bottom-0 w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 z-50 overflow-y-auto md:hidden transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-200 dark:border-gray-700">
            <Link
              href={isAdmin ? "/admin/dashboard" : "/dashboard"}
              className="flex items-center gap-2"
              onClick={onClose}
            >
              <LogoIcon className="h-8 w-8" size="sm" />
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                MyUnion
              </span>
            </Link>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Закрыть меню"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-4 space-y-2 overflow-y-auto px-4">
            {/* Chat menu - только для обычных пользователей */}
            {!isAdmin && <ChatMenu isCollapsed={false} />}

            {/* Other menu items */}
            {items.map((item) => {
              const isExpanded = expandedItems.includes(item.href);
              const hasSubItems = item.subItems && item.subItems.length > 0;
              const isActive = isMainItemActive(item);
              const hasActiveSubItem = hasSubItems
                ? item.subItems!.some((subItem) => isSubItemActive(subItem))
                : false;

              return (
                <div key={item.href} className="space-y-1">
                  {hasSubItems ? (
                    <>
                      <button
                        onClick={() => toggleExpanded(item.href)}
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive || hasActiveSubItem
                            ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                            : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                        }`}
                      >
                        {item.icon}
                        <span className="flex-1 text-left">{item.label}</span>
                        <svg
                          className={`h-4 w-4 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {isExpanded && (
                        <div className="ml-4 space-y-1 border-l border-gray-200 dark:border-gray-700 pl-4">
                          {item.subItems!.map((subItem) => {
                            const isSubActive = isSubItemActive(subItem);
                            return (
                              <Link
                                key={subItem.href}
                                href={subItem.href}
                                onClick={onClose}
                                className={`block rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                  isSubActive
                                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                                    : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                                }`}
                              >
                                {subItem.label}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </>
                  ) : (
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>

          {/* User section */}
          <div className="border-t border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-3 mb-4">
              {/* Avatar with link */}
              <Link
                href={isAdmin ? "/admin/users" : "/dashboard/profile"}
                className="h-10 w-10 rounded-full overflow-hidden bg-blue-600 flex items-center justify-center text-white font-semibold flex-shrink-0 hover:opacity-80 transition-opacity"
              >
                {avatarUrl && !avatarError ? (
                  <img
                    key={avatarUrl}
                    src={avatarUrl}
                    alt={userInitial}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                    crossOrigin="anonymous"
                    onLoad={() => {
                      setAvatarError(false);
                    }}
                    onError={() => {
                      setAvatarError(true);
                    }}
                  />
                ) : (
                  <span className="text-sm font-semibold">
                    {userInitial}
                  </span>
                )}
              </Link>
              
              {/* Theme toggle */}
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              Выйти
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

