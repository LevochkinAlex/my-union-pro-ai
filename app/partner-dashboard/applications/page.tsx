export default function PartnerApplicationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Заявки</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Заявки пользователей по вашим площадкам и акциям появятся здесь.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <p className="text-sm text-gray-600 dark:text-gray-400">Пока нет данных для отображения.</p>
      </div>
    </div>
  );
}
