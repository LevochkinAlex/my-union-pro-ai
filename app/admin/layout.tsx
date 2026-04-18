import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Sidebar from "@/components/dashboard/Sidebar";
import MobileLayout from "@/components/dashboard/MobileLayout";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = (session.user as { role?: string }).role;
  if (role !== "SUPER_ADMIN") {
    // При первом входе после назначения SUPER_ADMIN роль в сессии может ещё не обновиться — проверяем по БД
    try {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { role: true },
      });
      if (dbUser?.role !== "SUPER_ADMIN") {
        redirect("/dashboard");
      }
    } catch {
      redirect("/dashboard");
    }
  }

  const adminMenuItems = [
    {
      href: "/admin/dashboard",
      label: "Dashboard",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 12l2-4m0 0l7-4 7 4M5 8v10a1 1 0 001 1h12a1 1 0 001-1V8m-9 4v4m4-4v4"
          />
        </svg>
      ),
    },
    {
      href: "/admin/users",
      label: "Пользователи",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4.354a4 4 0 110 5.292M15 19H9a6 6 0 016-6h0a6 6 0 016 6v1H9v-1a4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      href: "/admin/partners",
      label: "Партнеры",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      ),
    },
    {
      href: "/admin/organizations",
      label: "Организации",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          />
        </svg>
      ),
    },
    {
      // Единая секция «Искусственный интеллект»: аналитика расходов,
      // боты, базы знаний и настройки провайдера. Подпункты `subItems`
      // рендерятся раскрывающейся панелью в Sidebar. На момент перехода
      // просто попадаем на страницу расходов — это самый частый кейс у супер-админа.
      href: "/admin/ai-chat/usage",
      label: "Искусственный интеллект",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
          />
        </svg>
      ),
      // Клик по самому пункту "Искусственный интеллект" ведёт на Аналитику
      // (основной кейс супер-админа), поэтому в subItems уже не дублируем
      // /admin/ai-chat/usage — оставляем только реальные разделы.
      subItems: [
        { href: "/admin/ai-chat?tab=bots", label: "Чат-боты" },
        { href: "/admin/ai-chat?tab=knowledge", label: "Базы знаний" },
        { href: "/admin/ai-chat?tab=providers", label: "Провайдер и модели" },
      ],
    },
    {
      href: "/admin/support-chats",
      label: "Чаты (поддержка)",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z"
          />
        </svg>
      ),
    },
    {
      href: "/admin/discounts",
      label: "Скидки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
      ),
    },
    {
      href: "/admin/invoices",
      label: "Выставленные счета",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      ),
    },
    {
      href: "/admin/monitoring",
      label: "Мониторинг",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      ),
    },
    {
      href: "/admin/settings",
      label: "Настройки",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
      ),
    },
  ];

  const userInitial = session.user?.name?.charAt(0).toUpperCase() || "A";

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      {/* Mobile Header and Menu */}
      <MobileLayout
        items={adminMenuItems}
        userInitial={userInitial}
        avatarUrl={null}
        isAdmin={true}
      />

      {/* Desktop Sidebar */}
      <Sidebar
        items={adminMenuItems}
        userInitial={userInitial}
        avatarUrl={null}
        isAdmin={true}
      />

      {/* Main content */}
      <div id="main-content" className="flex flex-col flex-1 md:pl-64 transition-all duration-300 min-w-0 bg-gray-50 dark:bg-gray-900">
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
