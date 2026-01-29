/**
 * Показывается при загрузке любого маршрута /dashboard/*.
 * Ускоряет первый ответ RSC (streaming) и снижает риск 503 из-за таймаутов nginx.
 */
export default function DashboardLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center p-8">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>
  );
}
