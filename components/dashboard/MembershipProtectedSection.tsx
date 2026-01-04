"use client";

import { useMembershipAccess } from "@/hooks/useMembershipAccess";
import Link from "next/link";
import { ReactNode } from "react";

interface MembershipProtectedSectionProps {
  children: ReactNode;
  title?: string;
}

/**
 * Компонент для защиты секций на главной странице
 * Показывает блюр с замком для невалидированных членов
 */
export default function MembershipProtectedSection({
  children,
  title = "Доступно членам профсоюза",
}: MembershipProtectedSectionProps) {
  const { isApproved, isLoading } = useMembershipAccess();

  // Если одобрен - показываем контент
  if (isApproved) {
    return <>{children}</>;
  }

  // Если загружается - показываем скелетон
  if (isLoading) {
    return (
      <div className="animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700 h-48" />
    );
  }

  // Блюр с замком
  return (
    <div className="relative">
      <div className="pointer-events-none select-none blur-sm opacity-50">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-gray-800/60 rounded-xl">
        <Link
          href="/dashboard/profile"
          className="flex flex-col items-center gap-3 rounded-2xl bg-white dark:bg-gray-800 px-6 py-4 shadow-xl border border-gray-200 dark:border-gray-700 transition hover:scale-105"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
            <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-900 dark:text-white">{title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Нажмите, чтобы стать членом
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}

