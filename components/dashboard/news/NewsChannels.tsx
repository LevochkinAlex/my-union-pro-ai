"use client";

import { memo, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface NewsChannel {
  id: string;
  name: string;
  description: string | null;
  subscriberCount: number;
  isMain: boolean;
  organizationId: string | null;
}

function NewsChannelsComponent() {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<NewsChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadChannels = async (retryCount = 0) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        
        try {
          const response = await fetch("/api/news/channels", {
            signal: controller.signal,
            cache: 'no-cache',
          });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            setChannels(data.channels || []);
          } else if (response.status >= 500 && retryCount < 2) {
            // Retry при ошибках сервера
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return loadChannels(retryCount + 1);
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if ((fetchError.name === 'AbortError' || fetchError.message?.includes('fetch')) && retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return loadChannels(retryCount + 1);
          }
          throw fetchError;
        }
      } catch (error) {
        console.error("Error loading channels:", error);
        // Не показываем ошибку пользователю, просто оставляем пустой список
      } finally {
        setLoading(false);
      }
    };

    loadChannels();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="p-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Новостные каналы
          </h2>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3 p-3 animate-pulse">
                <div className="h-12 w-12 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-gray-700" />
                  <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="p-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Новостные каналы
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
            Нет доступных каналов
          </p>
        </div>
      </div>
    );
  }

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
                {channel.description && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-1">
                    {channel.description}
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {channel.subscriberCount.toLocaleString()} участников
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {channels.length > 4 && (
        <div className="border-t border-gray-200 dark:border-gray-700 p-3">
          <button className="w-full text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition">
            Показать все каналы
          </button>
        </div>
      )}
    </div>
  );
}

// Мемоизируем компонент, чтобы избежать лишних рендеров
export default memo(NewsChannelsComponent);
