import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/dashboard/Sidebar";
import MiniChatWrapperConditional from "@/components/dashboard/MiniChatWrapperConditional";
import MobileLayout from "@/components/dashboard/MobileLayout";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // ИСПРАВЛЕНО: Добавлено логирование причин redirect
  if (!session) {
    console.log("[dashboard/layout] ⚠️ No session found, redirecting to /login");
    redirect("/login");
  }

  const userRole = session.user.role;
  const membershipStatus = session.user.membershipStatus;
  const isImpersonating = session.user.isImpersonating || false;
  
  // Получаем дополнительные данные пользователя из БД (viewMode, isPPOHead)
  const userData = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      viewMode: true,
      isPPOHead: true,
      ppoHeadOrganizationId: true,
    },
  });
  
  const viewMode = userData?.viewMode || "MEMBER";
  const isPPOHead = userData?.isPPOHead || false;
  
  console.log("[dashboard/layout] ✅ User authenticated:", {
    userId: session.user.id,
    role: userRole,
    viewMode,
    isPPOHead,
    isImpersonating
  });

  // Редирект супер-админов в админ-панель (только если не в режиме impersonation)
  if (userRole === "SUPER_ADMIN" && !isImpersonating) {
    console.log("[dashboard/layout] ℹ️ Super admin detected, redirecting to /admin/dashboard");
    redirect("/admin/dashboard");
  }

  // Определяем какое меню показывать на основе viewMode
  // ВАЖНО: Всегда используем viewMode для определения меню, даже если роль PPO_HEAD
  // Это позволяет председателям переключаться в режим обычного участника
  const showPPOHeadMenu = viewMode === "PPO_HEAD";

  // Создаем базовое меню
  let menuItems: Array<{
    href: string;
    label: string;
    icon: React.ReactNode;
    subItems?: { href: string; label: string }[];
  }> = [
    {
      href: "/dashboard",
      label: "Главная",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
  ];

  // Для Председателя добавляем специальные пункты меню
  if (showPPOHeadMenu) {
    menuItems.push({
      href: "/dashboard/documents",
      label: "Документы",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    });
    
    menuItems.push({
      href: "/dashboard/appeals",
      label: "Обращения",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/news",
      label: "Новости",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/users",
      label: "Профсеть",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/chats/ppo-head",
      label: "Чаты",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/discounts",
      label: "Скидки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/discounts", label: "Все скидки" },
        { href: "/dashboard/discounts/my", label: "Мои скидки и льготы" },
      ],
    });

    menuItems.push({
      href: "/dashboard/notifications",
      label: "Уведомления",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/members",
      label: "Члены профсоюза",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/staff",
      label: "Сотрудники",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/profile",
      label: "Профиль",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/settings",
      label: "Настройки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    });
  } else {
    // Меню для обычных членов профсоюза
    menuItems.push({
      href: "/dashboard/documents",
      label: "Документы",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    });
  }

  // Для обычных членов профсоюза добавляем стандартные пункты
  // ИСПРАВЛЕНО: Используем !showPPOHeadMenu вместо userRole !== "PPO_HEAD"
  // чтобы избежать дублирования меню для пользователей с isPPOHead=true
  if (!showPPOHeadMenu) {
    // Обращения (тикеты)
    menuItems.push({
      href: "/dashboard/appeals",
      label: "Обращения",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
    });

    // Новости доступны всем пользователям
    menuItems.push({
      href: "/dashboard/news",
      label: "Новости",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
    });

    // Чат доступен всем пользователям
    menuItems.push({
      href: "/dashboard/chat",
      label: "Чат",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    });

    // Уведомления доступны всем пользователям
    menuItems.push({
      href: "/dashboard/notifications",
      label: "Уведомления",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    });

    // Пользователи (члены профсоюза)
    menuItems.push({
      href: "/dashboard/users",
      label: "Профсеть",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });

    // Раздел скидок доступен всем
    menuItems.push({
      href: "/dashboard/discounts",
      label: "Скидки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/discounts", label: "Все скидки" },
        { href: "/dashboard/discounts/my", label: "Мои скидки и льготы" },
      ],
    });

    menuItems.push(
      {
        href: "/dashboard/profile",
        label: "Профиль",
        icon: (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
      },
      {
        href: "/dashboard/settings",
        label: "Настройки",
        icon: (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      }
    );
  }

  // Get user avatar
  let user: { avatarUrl: string | null } | null = null;
  if (session.user?.id) {
    try {
      user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { avatarUrl: true },
      });
    } catch (error) {
      console.error("[dashboard/layout] Error fetching user avatar:", error);
      // Продолжаем работу без аватара
    }
  }

  // Безопасное получение инициала пользователя
  const getUserInitial = () => {
    if (session?.user?.name) {
      return session.user.name.charAt(0).toUpperCase();
    }
    if (session?.user?.email) {
      return session.user.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Mobile Header and Menu */}
      <MobileLayout
        items={menuItems}
        userInitial={getUserInitial()}
        avatarUrl={user?.avatarUrl || null}
      />

      {/* Desktop Sidebar */}
      <Sidebar
        items={menuItems}
        userInitial={getUserInitial()}
        avatarUrl={user?.avatarUrl || null}
      />

      {/* Main content */}
      <div id="main-content" className="flex flex-col flex-1 md:pl-64 transition-all duration-300 min-w-0 bg-gray-50 dark:bg-gray-900">
        {/* Impersonation Banner */}
        {isImpersonating && <ImpersonationBanner />}
        <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden min-w-0 min-h-full">
          <div className="flex-1 overflow-y-auto overflow-x-hidden pt-16 md:pt-0 min-w-0 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="px-4 py-8 sm:px-8 lg:px-12 min-h-full w-full max-w-full min-w-0 bg-gray-50 dark:bg-gray-900">
              {children}
            </div>
          </div>
        </main>
      </div>
      
      {/* Мини-чат виджет (показывается на всех страницах кроме чатов) */}
      <MiniChatWrapperConditional />
    </div>
  );
}

