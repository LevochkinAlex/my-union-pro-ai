import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/dashboard/Sidebar";
import MiniChatWrapperConditional from "@/components/dashboard/MiniChatWrapperConditional";
import MobileLayout from "@/components/dashboard/MobileLayout";
import TourGuideProvider from "@/components/dashboard/TourGuideProvider";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import DemoBanner from "@/components/dashboard/DemoBanner";
import MaintenanceBanner from "@/components/dashboard/MaintenanceBanner";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { checkUserPermissions } from "@/lib/staff-permissions";
import { getViewMode, getAvailableViewModes } from "@/lib/session-user";
import { normalizeStaffPermissions } from "@/lib/staff-permission-matrix";

// Указываем, что layout динамический (использует getServerSession)
export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
  const session = await getServerSession(authOptions);

  // ИСПРАВЛЕНО: Добавлено логирование причин redirect
  if (!session) {
    console.log("[dashboard/layout] No session found, redirecting to /login");
    redirect("/login");
  }

  const userRole = session.user.role;
  const membershipStatus = session.user.membershipStatus;
  const isImpersonating = session.user.isImpersonating || false;
  const isDemo = session.user.id === DEMO_USER_ID || session.user.isDemo === true;

  // Берём флаги ролей и аватар из БД (fallback на сессию при ошибке)
  let viewMode = getViewMode(session);
  let serverViewModes = getAvailableViewModes(session);
  let isPPOHead = session.user.isPPOHead ?? false;
  let avatarUrl: string | null | undefined = undefined;
  let staffPermissions: { isStaff: boolean; permissions: Record<string, boolean> } | null = null;
  let dbUser: { membershipStatus?: string; unionMembershipStatus?: string; organizationId?: string | null } | null = null;

  if (session.user.id !== DEMO_MEMBER_USER_ID && !isDemo) {
    const LAYOUT_DB_TIMEOUT_MS = 2000;
    try {
      const [dbUserResult, staffResult, activeStaffPosition] = await Promise.all([
        prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            avatarUrl: true,
            viewMode: true,
            isPPOHead: true,
            ppoHeadOrganizationId: true,
            isMPOHead: true,
            mpoHeadOrganizationId: true,
            isRPOHead: true,
            rpoHeadOrganizationId: true,
            role: true,
            membershipStatus: true,
            unionMembershipStatus: true,
            organizationId: true,
          },
        }),
        Promise.race([
          checkUserPermissions(session.user.id),
          new Promise<{ isStaff: false; permissions: Record<string, boolean> }>((resolve) =>
            setTimeout(() => resolve({ isStaff: false, permissions: {} }), LAYOUT_DB_TIMEOUT_MS)
          ),
        ]).catch(() => ({ isStaff: false, permissions: {} })),
        prisma.organizationStaff.findFirst({
          where: { userId: session.user.id, status: "ACTIVE" },
          select: {
            id: true,
            organizationId: true,
            role: {
              select: {
                permissions: true,
              },
            },
          },
        }),
      ]);
      if (dbUserResult) {
        avatarUrl = dbUserResult.avatarUrl ?? undefined;
        isPPOHead = dbUserResult.isPPOHead ?? false;
        const fakeSession = { user: dbUserResult } as any;
        viewMode = getViewMode(fakeSession);
        serverViewModes = getAvailableViewModes(fakeSession);
        dbUser = dbUserResult;
      }
      console.log("[dashboard/layout] userId:", session.user.id, "dbUser:", dbUserResult ? { role: dbUserResult.role, isRPOHead: dbUserResult.isRPOHead, rpoHeadOrganizationId: dbUserResult.rpoHeadOrganizationId, viewMode: dbUserResult.viewMode } : "null", "serverViewModes:", serverViewModes);
      if (staffResult.isStaff && staffResult.permissions) {
        staffPermissions = { isStaff: true, permissions: staffResult.permissions };
      } else if (activeStaffPosition) {
        // Fallback: если резолвер прав не успел/упал, но должность активна — строим права из роли.
        staffPermissions = {
          isStaff: true,
          permissions: normalizeStaffPermissions(activeStaffPosition.role?.permissions),
        };
      }
    } catch (error) {
      console.error("[dashboard/layout] Database query error:", error);
    }
  }

  console.log("[dashboard/layout] FINAL userId:", session.user.id, "viewMode:", viewMode, "modes:", JSON.stringify(serverViewModes), "isImpersonating:", isImpersonating);

  // Редирект супер-админов в админ-панель (только если не в режиме impersonation)
  if (userRole === "SUPER_ADMIN" && !isImpersonating) {
    console.log("[dashboard/layout] Super admin detected, redirecting to /admin/dashboard");
    redirect("/admin/dashboard");
  }

  // Определяем какое меню показывать на основе viewMode и прав сотрудника
  const showPPOHeadMenu = viewMode === "PPO_HEAD";
  const showMPOHeadMenu = viewMode === "MPO_HEAD";
  const showRPOHeadMenu = viewMode === "RPO_HEAD";
  const showOrgHeadMenu = showMPOHeadMenu || showRPOHeadMenu; // МПО или РПО

  // Меню сотрудника показываем только когда выбран режим «Сотрудник» — иначе наложение с участником (документы, чаты)
  const showStaffMenu = viewMode === "STAFF" && staffPermissions?.isStaff === true;

  // Исключённый член ППО (не re-applying): только Главная, Профиль, Мои скидки, Чат
  const dbMembershipStatus = (dbUser as { membershipStatus?: string; unionMembershipStatus?: string } | null)?.membershipStatus;
  const dbUnionStatus = (dbUser as { unionMembershipStatus?: string } | null)?.unionMembershipStatus;
  const isReApplying = dbUnionStatus === "REMOVED" && (dbMembershipStatus === "DOCUMENTS_PENDING" || dbMembershipStatus === "PROFILE_INCOMPLETE");
  const isExcluded = (dbMembershipStatus === "EXCLUDED" || dbUnionStatus === "REMOVED") && !isReApplying;
  const isApproved = dbMembershipStatus === "APPROVED" || dbUnionStatus === "ACCEPTED";
  const perm = staffPermissions?.permissions ?? {};

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
        <svg key="icon-home" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
  ];

  // Исключённый член ППО: только Главная, Профиль, Мои скидки, Чат (без новостей, каталога скидок и др.)
  if (isExcluded) {
    menuItems.push({
      href: "/dashboard/discounts/my",
      label: "Мои скидки",
      icon: (
        <svg key="icon-discounts-excluded" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      ),
    });
    menuItems.push({
      href: "/dashboard/chat",
      label: "Чат",
      icon: (
        <svg key="icon-chat-excluded" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    });
    menuItems.push({
      href: "/dashboard/profile",
      label: "Профиль",
      icon: (
        <svg key="icon-profile-excluded" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    });
  }
  // Для Председателя добавляем специальные пункты меню
  else if (showPPOHeadMenu) {
    menuItems.push({
      href: "/dashboard/documents",
      label: "Документы",
      icon: (
        <svg key="icon-documents-ppo" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/documents?tab=incoming", label: "Входящие" },
        { href: "/dashboard/documents?tab=outgoing", label: "Исходящие" },
        ...((!isReApplying && isApproved) ? [{ href: "/dashboard/documents/meetings", label: "Заседания профкома" }] : []),
      ],
    });
    
    menuItems.push({
      href: "/dashboard/appeals?tab=incoming",
      label: "Обращения",
      icon: (
        <svg key="icon-appeals-ppo" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/appeals?tab=incoming", label: "Входящие" },
        { href: "/dashboard/appeals?tab=outgoing", label: "Исходящие" },
      ],
    });

    menuItems.push({
      href: "/dashboard/news",
      label: "Новости",
      icon: (
        <svg key="icon-news" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/users",
      label: "Профсеть",
      icon: (
        <svg key="icon-users" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/chats/ppo-head",
      label: "Чаты",
      icon: (
        <svg key="icon-chats-ppo" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/discounts",
      label: "Скидки",
      icon: (
        <svg key="icon-discounts" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        <svg key="icon-notifications" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/members",
      label: "Члены профсоюза",
      icon: (
        <svg key="icon-members" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/reports",
      label: "Отчётность",
      icon: (
        <svg key="icon-reports" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/subscription",
      label: "Подписка",
      icon: (
        <svg key="icon-subscription" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/staff",
      label: "Сотрудники",
      icon: (
        <svg key="icon-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/profile",
      label: "Профиль",
      icon: (
        <svg key="icon-profile" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/settings",
      label: "Настройки",
      icon: (
        <svg key="icon-settings" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    });
  } else if (showStaffMenu) {
    // Меню сотрудника ППО: те же разделы, что у председателя, но только с правами по роли
    if (perm.documents_view) {
      menuItems.push({
        href: "/dashboard/documents",
        label: "Документы",
        icon: (
          <svg key="icon-documents-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
        subItems: [
          { href: "/dashboard/documents?tab=incoming", label: "Входящие" },
          { href: "/dashboard/documents?tab=outgoing", label: "Исходящие" },
          ...((!isReApplying && isApproved) ? [{ href: "/dashboard/documents/meetings", label: "Заседания профкома" }] : []),
        ],
      });
    }
    if (perm.appeals_view) {
      menuItems.push({
        href: "/dashboard/appeals?tab=incoming",
        label: "Обращения",
        icon: (
          <svg key="icon-appeals-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        ),
        subItems: [
          { href: "/dashboard/appeals?tab=incoming", label: "Входящие" },
          { href: "/dashboard/appeals?tab=outgoing", label: "Исходящие" },
        ],
      });
    }
    if (perm.news_view) {
      menuItems.push({
        href: "/dashboard/news",
        label: "Новости",
        icon: (
          <svg key="icon-news-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7-8z" />
          </svg>
        ),
      });
    }
    if (perm.members_view) {
      menuItems.push({
        href: "/dashboard/users",
        label: "Профсеть",
        icon: (
          <svg key="icon-users-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      });
    }
    if (perm.chats_view) {
      menuItems.push({
        href: "/dashboard/chats/ppo-head",
        label: "Чаты",
        icon: (
          <svg key="icon-chats-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        ),
      });
    }
    if (perm.discounts_view) {
      menuItems.push({
        href: "/dashboard/discounts",
        label: "Скидки",
        icon: (
          <svg key="icon-discounts-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        ),
        subItems: [
          { href: "/dashboard/discounts", label: "Все скидки" },
          { href: "/dashboard/discounts/my", label: "Мои скидки и льготы" },
        ],
      });
    }
    menuItems.push({
      href: "/dashboard/notifications",
      label: "Уведомления",
      icon: (
        <svg key="icon-notifications-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    });
    if (perm.members_view) {
      menuItems.push({
        href: "/dashboard/members",
        label: "Члены профсоюза",
        icon: (
          <svg key="icon-members-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        ),
      });
    }
    if (perm.reports_view) {
      menuItems.push({
        href: "/dashboard/reports",
        label: "Отчётность",
        icon: (
          <svg key="icon-reports-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      });
    }
    if (perm.staff_view) {
      menuItems.push({
        href: "/dashboard/staff",
        label: "Сотрудники",
        icon: (
          <svg key="icon-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      });
    }
    if (perm.settings_view || perm.settings_manage) {
      menuItems.push({
        href: "/dashboard/settings",
        label: "Настройки",
        icon: (
          <svg key="icon-settings-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
      });
    }
    menuItems.push({
      href: "/dashboard/profile",
      label: "Профиль",
      icon: (
        <svg key="icon-profile-staff" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    });
  } else if (showOrgHeadMenu) {
    // Меню для руководителей МПО/РПО
    menuItems.push({
      href: "/dashboard/organizations",
      label: "Организации",
      icon: (
        <svg key="icon-organizations" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/users/org-head",
      label: "Пользователи",
      icon: (
        <svg key="icon-users-org" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    });

    if (showRPOHeadMenu) {
      menuItems.push({
        href: "/dashboard/roles",
        label: "Роли и должности",
        icon: (
          <svg key="icon-roles" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        ),
      });
      menuItems.push({
        href: "/dashboard/staff",
        label: "Сотрудники",
        icon: (
          <svg key="icon-staff-rpo" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      });
      menuItems.push({
        href: "/dashboard/document-templates",
        label: "Конструктор документов",
        icon: (
          <svg key="icon-doc-constructor" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        ),
      });
    }

    menuItems.push({
      href: "/dashboard/reports/org-head",
      label: "Отчётность",
      icon: (
        <svg key="icon-reports-org" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/reports/org-head", label: "Отчёты организаций" },
        { href: "/dashboard/statistics", label: "Статистика и графики" },
      ],
    });

    menuItems.push({
      href: "/dashboard/chats/ppo-head",
      label: "Чаты",
      icon: (
        <svg key="icon-chats-org" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/news",
      label: "Новости",
      icon: (
        <svg key="icon-news" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/profile",
      label: "Профиль",
      icon: (
        <svg key="icon-profile" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    });

    menuItems.push({
      href: "/dashboard/settings",
      label: "Настройки",
      icon: (
        <svg key="icon-settings" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    });
  } else {
    // Меню для обычных членов профсоюза: Входящие (устав и т.д.) / Исходящие (заявления)
    menuItems.push({
      href: "/dashboard/documents",
      label: "Документы",
      icon: (
        <svg key="icon-documents-member" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/documents?tab=incoming", label: "Входящие" },
        { href: "/dashboard/documents?tab=outgoing", label: "Исходящие" },
      ],
    });
  }

  // Для обычных членов профсоюза добавляем стандартные пункты (не председатель, не МПО/РПО, не сотрудник ППО, не исключённый)
  if (!showPPOHeadMenu && !showOrgHeadMenu && !showStaffMenu && !isExcluded) {
    // Обращения: у председателя в режиме «участник» — Входящие/Исходящие, у остальных — один пункт
    menuItems.push({
      href: isPPOHead ? "/dashboard/appeals?tab=incoming" : "/dashboard/appeals",
      label: "Обращения",
      icon: (
        <svg key="icon-appeals-member" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      ),
      ...(isPPOHead
        ? {
            subItems: [
              { href: "/dashboard/appeals?tab=incoming", label: "Входящие" },
              { href: "/dashboard/appeals?tab=outgoing", label: "Исходящие" },
            ],
          }
        : {}),
    });

    // Новости доступны всем пользователям
    menuItems.push({
      href: "/dashboard/news",
      label: "Новости",
      icon: (
        <svg key="icon-news" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
    });

    // Чат доступен всем пользователям
    menuItems.push({
      href: "/dashboard/chat",
      label: "Чат",
      icon: (
        <svg key="icon-chat" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    });

    // Уведомления доступны всем пользователям
    menuItems.push({
      href: "/dashboard/notifications",
      label: "Уведомления",
      icon: (
        <svg key="icon-notifications" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    });

    // Пользователи (члены профсоюза)
    menuItems.push({
      href: "/dashboard/users",
      label: "Профсеть",
      icon: (
        <svg key="icon-users" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    });

    // Раздел скидок доступен всем
    menuItems.push({
      href: "/dashboard/discounts",
      label: "Скидки",
      icon: (
        <svg key="icon-discounts" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      subItems: [
        { href: "/dashboard/discounts", label: "Все скидки" },
        { href: "/dashboard/discounts/my", label: "Мои скидки и льготы" },
      ],
    });

    menuItems.push({
        href: "/dashboard/profile",
        label: "Профиль",
        icon: (
        <svg key="icon-profile" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ),
    });
    
    menuItems.push({
        href: "/dashboard/settings",
        label: "Настройки",
        icon: (
        <svg key="icon-settings" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
    });
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
    <TourGuideProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
        {/* Mobile Header and Menu */}
        <MobileLayout
          items={menuItems}
          userInitial={getUserInitial()}
          avatarUrl={avatarUrl}
          serverViewModes={serverViewModes}
          serverViewMode={viewMode}
        />

        {/* Desktop Sidebar */}
        <Sidebar
          items={menuItems}
          userInitial={getUserInitial()}
          avatarUrl={avatarUrl}
          serverViewModes={serverViewModes}
          serverViewMode={viewMode}
        />

        {/* Main content */}
        <div id="main-content" className="flex flex-col flex-1 md:pl-64 transition-all duration-300 min-w-0 bg-gray-50 dark:bg-gray-900">
          {/* Impersonation Banner */}
          {isImpersonating && <ImpersonationBanner />}
          {/* Временный баннер о модернизации для членов и председателей */}
          <MaintenanceBanner userId={session.user.id} />
          <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden min-w-0 min-h-full">
          <div data-tour="main-content" className="flex-1 overflow-y-auto overflow-x-hidden pt-16 md:pt-0 min-w-0 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="px-4 py-8 sm:px-8 lg:px-12 min-h-full w-full max-w-full min-w-0 bg-gray-50 dark:bg-gray-900">
                {(session.user.id === DEMO_USER_ID || session.user.id === DEMO_MEMBER_USER_ID || (session.user as { isDemo?: boolean }).isDemo) && (
                  <DemoBanner />
                )}
                {children}
              </div>
            </div>
          </main>
        </div>
        
        {/* Мини-чат виджет (синхронизирован с основным чатом ИИ-Ассистент) */}
        <MiniChatWrapperConditional />
      </div>
    </TourGuideProvider>
  );
  } catch (error: any) {
    // NEXT_REDIRECT - это нормальное исключение Next.js, не ошибка
    if (error?.message === 'NEXT_REDIRECT' || error?.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Пробрасываем редирект дальше
    }
    // Полный стек в логах для разбора 503 на _rsc (documents, users, appeals)
    console.error("[dashboard/layout] Fatal error:", error?.message, error?.stack ?? error);
    
    // Только для реальных ошибок проверяем сессию еще раз
    try {
      const session = await getServerSession(authOptions);
      if (!session) {
        redirect("/login?error=session_error");
      }
    } catch (sessionError) {
      redirect("/login?error=session_error");
    }
    
    // Если сессия есть, но все равно ошибка - пробрасываем дальше
    throw error;
  }
}

