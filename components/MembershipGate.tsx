"use client";

import { useMembershipAccess } from "@/hooks/useMembershipAccess";
import Link from "next/link";
import { ReactNode } from "react";

interface MembershipGateProps {
  children: ReactNode;
  /** Показывать блюр вместо полной блокировки */
  showBlur?: boolean;
  /** Заголовок модалки */
  title?: string;
  /** Описание */
  description?: string;
}

/**
 * Компонент для ограничения доступа невалидированным членам профсоюза
 * Показывает блюр с модалкой "Стань членом профсоюза"
 */
export function MembershipGate({
  children,
  showBlur = true,
  title = "Станьте членом профсоюза",
  description,
}: MembershipGateProps) {
  const { status, isApproved, isLoading, message } = useMembershipAccess();

  // Пока загружается - показываем скелетон
  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-700" />
      </div>
    );
  }

  // Если одобрен - показываем контент
  if (isApproved) {
    return <>{children}</>;
  }

  // Определяем текст в зависимости от статуса
  const getStatusInfo = () => {
    switch (status) {
      case "incomplete":
        return {
          icon: "📝",
          title: "Заполните анкету",
          description: "Для доступа к этому разделу необходимо заполнить профиль и подать заявку на вступление в профсоюз.",
          buttonText: "Заполнить анкету",
          buttonLink: "/dashboard/profile",
        };
      case "pending":
        return {
          icon: "⏳",
          title: "Заявка на рассмотрении",
          description: "Ваша заявка находится на рассмотрении у председателя профсоюзной организации. Дождитесь одобрения для получения полного доступа.",
          buttonText: "Перейти в профиль",
          buttonLink: "/dashboard/profile",
        };
      case "rejected":
        return {
          icon: "❌",
          title: "Заявка отклонена",
          description: "К сожалению, ваша заявка была отклонена. Свяжитесь с председателем для уточнения причин.",
          buttonText: "Связаться с поддержкой",
          buttonLink: "/dashboard/appeals/new",
        };
      default:
        return {
          icon: "🔐",
          title: title,
          description: description || message,
          buttonText: "Перейти в профиль",
          buttonLink: "/dashboard/profile",
        };
    }
  };

  const info = getStatusInfo();

  return (
    <div className="relative">
      {/* Заблюренный контент */}
      {showBlur && (
        <div className="pointer-events-none select-none blur-md opacity-50">
          {children}
        </div>
      )}

      {/* Оверлей с модалкой */}
      <div className={`${showBlur ? "absolute inset-0" : ""} flex items-center justify-center bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm rounded-xl`}>
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          {/* Иконка */}
          <div className="mb-4 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-4xl shadow-lg">
              {info.icon}
            </div>
          </div>

          {/* Заголовок */}
          <h2 className="mb-3 text-center text-2xl font-bold text-gray-900 dark:text-white">
            {info.title}
          </h2>

          {/* Описание */}
          <p className="mb-6 text-center text-gray-600 dark:text-gray-400">
            {info.description}
          </p>

          {/* Кнопка */}
          <Link
            href={info.buttonLink}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-semibold text-white shadow-lg transition hover:from-blue-700 hover:to-indigo-700 hover:shadow-xl"
          >
            {info.buttonText}
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </Link>

          {/* Дополнительная информация */}
          <p className="mt-4 text-center text-xs text-gray-500 dark:text-gray-500">
            Членство в профсоюзе даёт доступ к скидкам, новостям и общению с коллегами
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Компонент для блюра отдельных карточек на главной
 */
export function MembershipBlurCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isApproved, isLoading } = useMembershipAccess();

  if (isLoading || isApproved) {
    return <>{children}</>;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Заблюренный контент */}
      <div className="pointer-events-none select-none blur-sm opacity-60">
        {children}
      </div>

      {/* Оверлей с иконкой замка */}
      <div className="absolute inset-0 flex items-center justify-center">
        <Link
          href="/dashboard/profile"
          className="flex flex-col items-center gap-2 rounded-xl bg-white/90 dark:bg-gray-800/90 px-4 py-3 shadow-lg backdrop-blur-sm transition hover:scale-105"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-xl">
            🔐
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Стать членом
          </span>
        </Link>
      </div>
    </div>
  );
}

