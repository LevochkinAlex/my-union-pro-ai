"use client";

import { memo } from "react";

function NewsChannelsComponent() {
  const channels = [
    {
      id: "1",
      name: "МООП РЗ РФ",
      description: "Московская областная организация профсоюза",
      members: 1247,
      isMain: true,
    },
    {
      id: "2",
      name: "Профсоюз врачей Москвы",
      description: "Объединение медицинских работников",
      members: 892,
      isMain: false,
    },
    {
      id: "3",
      name: "Профсоюз медсестер",
      description: "Профессиональное сообщество медсестер",
      members: 654,
      isMain: false,
    },
    {
      id: "4",
      name: "Профсоюз фармацевтов",
      description: "Работники аптечной сферы",
      members: 423,
      isMain: false,
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Новостные каналы
        </h2>

        <div className="space-y-3">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="group flex items-start gap-3 rounded-lg p-3 transition hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                  />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {channel.name}
                  </h3>
                  {channel.isMain && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                      Мой
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                  {channel.description}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {channel.members.toLocaleString()} участников
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <button className="w-full text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition">
          Показать все каналы
        </button>
      </div>
    </div>
  );
}

// Мемоизируем компонент, чтобы избежать лишних рендеров
export default memo(NewsChannelsComponent);

