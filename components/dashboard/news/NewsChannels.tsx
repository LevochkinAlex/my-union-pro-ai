"use client";

import { useState, useEffect, memo } from "react";
import { useSession } from "next-auth/react";

interface NewsChannel {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isDefault: boolean;
  _count?: {
    newsPosts: number;
  };
  organization?: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
}

interface Props {
  onChannelSelect?: (channelId: string | null) => void;
  selectedChannelId?: string | null;
}

function NewsChannelsComponent({ onChannelSelect, selectedChannelId }: Props) {
  const { data: session } = useSession();
  const [channels, setChannels] = useState<NewsChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [organization, setOrganization] = useState<{
    name: string;
    logoUrl: string | null;
  } | null>(null);

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    try {
      setLoading(true);
      // Загружаем каналы организации пользователя
      const response = await fetch("/api/news/channels");
      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels || []);
        setOrganization(data.organization || null);
      }
    } catch (error) {
      console.error("Ошибка загрузки каналов:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="p-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Новостные каналы
          </h2>
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="animate-pulse flex items-start gap-3 p-3">
                <div className="h-12 w-12 rounded-lg bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Если нет каналов, показываем только организацию
  if (channels.length === 0 && organization) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="p-4">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
            Новостные каналы
          </h2>
          <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
            Каналов пока нет
          </div>
        </div>
      </div>
    );
  }

  if (channels.length === 0) {
    return null;
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
              onClick={() => onChannelSelect?.(channel.id)}
              className={`group flex items-start gap-3 rounded-lg p-3 transition cursor-pointer ${
                selectedChannelId === channel.id
                  ? "bg-blue-50 dark:bg-blue-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              {channel.iconUrl ? (
                <img
                  src={channel.iconUrl}
                  alt={channel.name}
                  className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                />
              ) : channel.organization?.logoUrl ? (
                <img
                  src={channel.organization.logoUrl}
                  alt={channel.name}
                  className="h-12 w-12 flex-shrink-0 rounded-lg object-cover"
                />
              ) : (
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
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {channel.name}
                  </h3>
                  {channel.isDefault && (
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
                {channel._count && (
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {channel._count.newsPosts} публикаций
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {channels.length > 3 && (
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
