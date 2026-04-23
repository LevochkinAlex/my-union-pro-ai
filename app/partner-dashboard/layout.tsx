import React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MobileLayout from "@/components/dashboard/MobileLayout";
import Sidebar from "@/components/dashboard/Sidebar";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";

export default async function PartnerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const isImpersonating =
    Boolean((session.user as { isImpersonating?: boolean }).isImpersonating) || false;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      role: true,
      firstName: true,
      lastName: true,
      partnerRecord: { select: { moderationStatus: true } },
    },
  });

  if (!user || user.role !== "PARTNER") {
    redirect("/dashboard");
  }

  if (user.partnerRecord?.moderationStatus === "BLOCKED") {
    redirect("/login?partnerBlocked=1");
  }

  const userInitial =
    (user.firstName?.charAt(0) || user.lastName?.charAt(0) || "P").toUpperCase();

  const menuItems = [
    {
      href: "/partner-dashboard",
      label: "Главная",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
    {
      href: "/partner-dashboard/venues",
      label: "Площадки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      href: "/partner-dashboard/profile",
      label: "Профиль",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
    },
    {
      href: "/partner-dashboard/settings",
      label: "Настройки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <MobileLayout
        items={menuItems}
        userInitial={userInitial}
        avatarUrl={null}
        brandHref="/partner-dashboard"
      />

      <Sidebar
        items={menuItems}
        userInitial={userInitial}
        avatarUrl={null}
        brandHref="/partner-dashboard"
      />

      <div id="main-content" className="flex flex-col flex-1 md:pl-64 transition-all duration-300 min-w-0 bg-gray-50 dark:bg-gray-900">
        {isImpersonating ? <ImpersonationBanner /> : null}
        <main className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden min-w-0 min-h-full">
          <div className="flex-1 overflow-y-auto overflow-x-hidden pt-16 md:pt-0 min-w-0 bg-gray-50 dark:bg-gray-900 min-h-full">
            <div className="px-4 py-4 sm:px-6 lg:px-8 min-h-full w-full max-w-full min-w-0 bg-gray-50 dark:bg-gray-900">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
