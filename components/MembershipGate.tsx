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
 * Компонент для ограничения доступа непроверенным членам профсоюза
 * Показывает блюр с модалкой "Стань членом профсоюза"
 */
export function MembershipGate({
  children,
  showBlur = true,
  title = "Станьте членом профсоюза",
  description,
}: MembershipGateProps) {
  const { status, isApproved, isLoading, message } = useMembershipAccess();

  // Пока загружается - показываем лоадер в области контента
  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Если одобрен - показываем контент
  if (isApproved) {
    return <>{children}</>;
  }

  // SVG иконки
  const icons = {
    document: (
      <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
    clock: (
      <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    rejected: (
      <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
      </svg>
    ),
    lock: (
      <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  };

  // Определяем текст в зависимости от статуса
  const getStatusInfo = () => {
    switch (status) {
      case "incomplete":
        return {
          icon: icons.document,
          title: "Заполните анкету",
          description: "Для доступа к этому разделу необходимо заполнить профиль и подать заявку на вступление в профсоюз.",
          buttonText: "Заполнить анкету",
          buttonLink: "/dashboard?openQuestionnaire=true",
        };
      case "pending":
        return {
          icon: icons.clock,
          title: "Заявка на рассмотрении",
          description: "Ваша заявка находится на рассмотрении у председателя профсоюзной организации. Дождитесь одобрения для получения полного доступа.",
          buttonText: "На главную",
          buttonLink: "/dashboard",
        };
      case "rejected":
        return {
          icon: icons.rejected,
          title: "Заявка отклонена",
          description: "К сожалению, ваша заявка была отклонена. Свяжитесь с председателем для уточнения причин.",
          buttonText: "Связаться с поддержкой",
          buttonLink: "/dashboard/appeals/new",
        };
      case "excluded":
        return {
          icon: icons.rejected,
          title: "Вы исключены из профсоюза",
          description: "Вы были исключены из профсоюза. Для уточнения причин свяжитесь с председателем.",
          buttonText: "На главную",
          buttonLink: "/dashboard",
        };
      default:
        return {
          icon: icons.lock,
          title: title,
          description: description || message,
          buttonText: "На главную",
          buttonLink: "/dashboard",
        };
    }
  };

  const info = getStatusInfo();

  return (
    <div className="relative min-h-[60vh]">
      {/* Заблюренный контент */}
      {showBlur && (
        <div className="pointer-events-none select-none blur-md opacity-50">
          {children}
        </div>
      )}

      {/* Модалка - абсолютно позиционирована поверх контента */}
      <div className="absolute inset-0 flex items-start justify-center pt-20">
        <div className="mx-4 max-w-md rounded-2xl bg-white p-8 shadow-2xl dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
          {/* Иконка */}
          <div className="mb-4 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg">
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
          href="/dashboard?openQuestionnaire=true"
          className="flex flex-col items-center gap-2 rounded-xl bg-white/90 dark:bg-gray-800/90 px-4 py-3 shadow-lg backdrop-blur-sm transition hover:scale-105"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Стать членом
          </span>
        </Link>
      </div>
    </div>
  );
}

