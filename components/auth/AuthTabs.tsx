"use client";

import Link from "next/link";

type AuthTab = "login" | "register";

interface AuthTabsProps {
  active: AuthTab;
}

/**
 * Переключатель Вход / Регистрация — единый вид с обеими страницами auth layout.
 */
export default function AuthTabs({ active }: AuthTabsProps) {
  const base =
    "flex-1 rounded-lg py-2.5 text-sm font-medium text-center transition-all duration-150";
  const inactive =
    "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white";
  const activeCls =
    "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm ring-1 ring-gray-200/80 dark:ring-gray-600";

  return (
    <nav className="mb-8 flex rounded-xl bg-gray-100 p-1 dark:bg-gray-700/60" aria-label="Вход или регистрация">
      <Link
        href="/login"
        className={`${base} ${active === "login" ? activeCls : inactive}`}
        aria-current={active === "login" ? "page" : undefined}
      >
        Вход
      </Link>
      <Link
        href="/register"
        className={`${base} ${active === "register" ? activeCls : inactive}`}
        aria-current={active === "register" ? "page" : undefined}
      >
        Регистрация
      </Link>
    </nav>
  );
}
