import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);
  
  const userCount = await prisma.user.count();
  const documentCount = await prisma.document.count();
  const organizationCount = await prisma.organization.count();

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Панель управления системой MyUnion
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 min-w-0 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-blue-200/60 bg-blue-50 dark:border-blue-800/50 dark:bg-blue-950/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-blue-200/50 dark:bg-blue-800/40" aria-hidden>
            <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 19H9a6 6 0 016-6h0a6 6 0 016 6v1H9v-1a4 4 0 018 0z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Всего пользователей</p>
          <p className="text-2xl font-semibold tabular-nums text-blue-900 dark:text-blue-100 sm:text-3xl">{userCount}</p>
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl border border-emerald-200/60 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-950/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-emerald-200/50 dark:bg-emerald-800/40" aria-hidden>
            <svg className="h-5 w-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">Всего документов</p>
          <p className="text-2xl font-semibold tabular-nums text-emerald-900 dark:text-emerald-100 sm:text-3xl">{documentCount}</p>
        </div>

        <div className="min-w-0 overflow-hidden rounded-2xl border border-violet-200/60 bg-violet-50 dark:border-violet-800/50 dark:bg-violet-950/40 p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex shrink-0 w-10 h-10 items-center justify-center rounded-xl bg-violet-200/50 dark:bg-violet-800/40" aria-hidden>
            <svg className="h-5 w-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-violet-700 dark:text-violet-300">Всего организаций</p>
          <p className="text-2xl font-semibold tabular-nums text-violet-900 dark:text-violet-100 sm:text-3xl">{organizationCount}</p>
        </div>
      </div>

      {/* Welcome */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-4 lg:p-6 min-w-0">
        <h2 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white">
          Добро пожаловать, {session?.user?.name || "администратор"}!
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Используйте меню слева для управления системой, пользователями и настройками.
        </p>
      </div>
    </div>
  );
}

