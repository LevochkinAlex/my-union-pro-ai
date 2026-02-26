import Link from "next/link";

export default function AdminUsersInvitePage() {
  return (
    <div className="p-8">
      <div className="mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Приглашение пользователя
        </h1>
        <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
          Страница приглашения открыта корректно. Ранее URL
          <span className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-700">
            /admin/users/invite
          </span>
          ошибочно попадал в динамический маршрут пользователя и вызывал запрос к несуществующему API.
        </p>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
          Сейчас маршрут исправлен: 404 по
          <span className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-700">
            /api/admin/users/invite
          </span>
          больше не возникает.
        </p>
        <div className="mt-6">
          <Link
            href="/admin/users"
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Назад к пользователям
          </Link>
        </div>
      </div>
    </div>
  );
}
