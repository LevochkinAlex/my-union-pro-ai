"use client";

interface SearchFormProps {
  search: string;
  onSearchChange: (value: string) => void;
  total: number;
  onSubmit: (e: React.FormEvent) => void;
  isMobile?: boolean;
}

export default function SearchForm({
  search,
  onSearchChange,
  total,
  onSubmit,
  isMobile = false,
}: SearchFormProps) {
  const containerClass = isMobile
    ? "bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
    : "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 lg:p-6";

  const inputClass = isMobile
    ? "w-full px-4 py-3 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
    : "w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  const buttonClass = isMobile
    ? "w-full sm:w-auto px-6 py-3 bg-blue-600 text-white rounded-lg font-medium active:bg-blue-700 transition-colors touch-manipulation text-base"
    : "w-full lg:w-auto px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors";

  const searchId = isMobile ? "mobile-search" : "search";

  return (
    <div className={containerClass}>
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Поиск */}
        <div>
          <label
            htmlFor={searchId}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
          >
            Поиск по имени, email или телефону
          </label>
          <div className="relative">
            <input
              type="text"
              id={searchId}
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Введите имя, email или телефон..."
              className={inputClass}
              autoComplete="off"
            />
            <svg
              className="absolute left-3 top-2.5 h-5 w-5 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
        </div>

        <div
          className={`flex flex-col ${
            isMobile ? "sm:flex-row" : "lg:flex-row"
          } items-start ${
            isMobile ? "sm:items-center" : "lg:items-center"
          } justify-between w-full h-fit gap-4`}
        >
          <button type="submit" className={buttonClass}>
            Найти
          </button>
          {total > 0 && (
            <p
              className={`text-sm text-gray-600 dark:text-gray-400 ${
                isMobile ? "sm:text-right whitespace-nowrap" : ""
              }`}
            >
              Найдено: {total}{" "}
              {total === 1
                ? "участник"
                : total < 5
                  ? "участника"
                  : "участников"}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

