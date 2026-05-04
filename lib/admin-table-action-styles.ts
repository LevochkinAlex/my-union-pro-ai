/** Общая геометрия кнопок действий в одной колонке (ссылка и «Войти как»). */
const adminTableActionSizeClass =
  "min-h-[2.125rem] w-[8rem] max-w-full shrink-0 flex-nowrap items-center justify-center whitespace-nowrap";

/** Контурная кнопка действия в таблицах (как «Просмотр» в partner-dashboard). */
export const adminTableActionOutlineClass =
  `inline-flex rounded-md border border-blue-600 bg-white/90 px-2.5 py-1.5 text-sm font-medium text-blue-600 shadow-sm transition hover:bg-blue-50 dark:border-blue-500 dark:bg-gray-800/90 dark:text-blue-400 dark:hover:bg-blue-900/20 ${adminTableActionSizeClass}`;

/** Контурная кнопка «Войти от имени» — тот же формат и размер, зелёная палитра. */
export const adminTableImpersonateOutlineClass =
  `inline-flex rounded-md border border-green-600 bg-white/90 px-2.5 py-1.5 text-sm font-medium text-green-600 shadow-sm transition hover:border-green-700 hover:bg-green-100 hover:text-green-800 dark:border-green-500 dark:bg-gray-800/90 dark:text-green-400 dark:hover:border-green-400 dark:hover:bg-green-900/45 dark:hover:text-green-300 ${adminTableActionSizeClass}`;

