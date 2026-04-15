import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function PartnerDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      firstName: true,
      partnerRecordId: true,
      partnerRecord: {
        select: {
          id: true,
          name: true,
          venues: {
            select: { id: true, isActive: true },
          },
        },
      },
    },
  });

  const partner = user?.partnerRecord;
  const totalVenues = partner?.venues?.length ?? 0;
  const activeVenues = partner?.venues?.filter((v) => v.isActive).length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Кабинет партнёра
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Добро пожаловать{user?.firstName ? `, ${user.firstName}` : ""}! Здесь вы можете управлять своими площадками и магазинами.
        </p>
      </div>

      {partner && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Организация
          </p>
          <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
            {partner.name}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Всего площадок
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {totalVenues}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Активных площадок
          </p>
          <p className="mt-2 text-3xl font-bold text-green-600 dark:text-green-400">
            {activeVenues}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Неактивных площадок
          </p>
          <p className="mt-2 text-3xl font-bold text-gray-400 dark:text-gray-500">
            {totalVenues - activeVenues}
          </p>
        </div>
      </div>

      <div>
        <Link
          href="/partner-dashboard/venues"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          Мои площадки
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
