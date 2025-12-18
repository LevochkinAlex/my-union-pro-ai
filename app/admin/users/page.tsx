import { prisma } from "@/lib/prisma";
import Link from "next/link";
import ImpersonateButton from "@/components/admin/users/ImpersonateButton";
import QuickApproveButton from "@/components/admin/users/QuickApproveButton";

export default async function AdminUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      documents: {
        where: {
          type: {
            in: ["MEMBERSHIP_APPLICATION", "CONTRIBUTION_APPLICATION"],
          },
          status: {
            in: ["SIGNED", "PENDING"],
          },
        },
      },
      organization: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  // Подсчёт ожидающих валидации
  const pendingCount = users.filter(u => 
    u.membershipStatus === "DOCUMENTS_PENDING" || 
    u.membershipStatus === "PENDING_VERIFICATION"
  ).length;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Управление пользователями
          </h1>
          {pendingCount > 0 && (
            <p className="mt-1 text-sm text-yellow-600 dark:text-yellow-400">
              ⚠️ {pendingCount} пользователей ожидают валидации
            </p>
          )}
        </div>
        <Link
          href="/admin/users/invite"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Пригласить пользователя
        </Link>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow dark:bg-gray-800">
        <table className="w-full">
          <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Email
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Имя
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Роль
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Статус
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Дата регистрации
              </th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 dark:text-white">
                Действия
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => {
              // Проверяем, есть ли документы, ожидающие валидации
              const hasPendingDocuments = user.documents.length > 0;
              const needsAttention = hasPendingDocuments && 
                (user.membershipStatus === "DOCUMENTS_PENDING" || 
                 user.membershipStatus === "PENDING_VERIFICATION");
              
              return (
              <tr 
                key={user.id} 
                className={`hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  needsAttention 
                    ? "bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 animate-pulse" 
                    : ""
                }`}
              >
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                  {user.email}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {user.firstName} {user.lastName}
                </td>
                <td className="px-6 py-4 text-sm">
                  <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                      user.membershipStatus === "APPROVED"
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                    }`}
                  >
                    {user.membershipStatus}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {user.createdAt.toLocaleDateString("ru-RU")}
                </td>
                <td className="px-6 py-4 text-sm">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      Просмотр
                    </Link>
                    {needsAttention && (
                      <QuickApproveButton userId={user.id} userName={`${user.firstName} ${user.lastName}`} />
                    )}
                    <ImpersonateButton userId={user.id} userEmail={user.email || ""} />
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <div className="rounded-lg bg-white p-8 text-center shadow dark:bg-gray-800">
          <p className="text-gray-600 dark:text-gray-400">
            Пользователей не найдено
          </p>
        </div>
      )}
    </div>
  );
}

