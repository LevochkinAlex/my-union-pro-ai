"use client";

import { useEffect, useState, useRef, memo } from "react";
import Link from "next/link";
import Image from "next/image";

interface Member {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  organization?: {
    name: string;
  } | null;
}

function UnionMembersComponent() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasOrganization, setHasOrganization] = useState(true);
  const isLoadingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    // Загружаем только один раз
    if (!hasLoadedRef.current && !isLoadingRef.current) {
      loadMembers();
    }
  }, []);

  const loadMembers = async (retryCount = 0) => {
    if (isLoadingRef.current || hasLoadedRef.current) return;
    
    isLoadingRef.current = true;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      try {
        const response = await fetch("/api/union-members?limit=5", {
          signal: controller.signal,
          cache: 'no-cache',
        });
        clearTimeout(timeoutId);
        
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
        setHasOrganization(data.hasOrganization !== false);
        hasLoadedRef.current = true;
        } else if (response.status >= 500 && retryCount < 2) {
          // Retry при ошибках сервера
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          isLoadingRef.current = false;
          return loadMembers(retryCount + 1);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if ((fetchError.name === 'AbortError' || fetchError.message?.includes('fetch')) && retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          isLoadingRef.current = false;
          return loadMembers(retryCount + 1);
        }
        throw fetchError;
      }
    } catch (error) {
      console.error("Failed to load members:", error);
      // Не показываем ошибку пользователю, просто оставляем пустой список
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  };

  const getMemberName = (member: Member) => {
    if (member.firstName && member.lastName) {
      return `${member.firstName} ${member.lastName}`;
    }
    return member.email.split("@")[0];
  };

  const getInitials = (member: Member) => {
    if (member.firstName && member.lastName) {
      return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
    }
    return member.email[0].toUpperCase();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800 p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="p-4">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">
          Коллеги профсоюза
        </h2>

        {!hasOrganization ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Укажите организацию в профиле, чтобы видеть коллег
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Пока нет коллег в вашей организации
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {members.map((member) => (
              <div
                key={member.id}
                className="group flex items-center gap-3 rounded-lg p-3 transition hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                {/* Avatar */}
                {member.avatarUrl ? (
                  member.avatarUrl.startsWith('data:') ? (
                    <div className="h-12 w-12 rounded-full overflow-hidden flex-shrink-0">
                      <img
                        src={member.avatarUrl}
                        alt={getMemberName(member)}
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="relative h-12 w-12 rounded-full overflow-hidden flex-shrink-0">
                      <Image
                        src={member.avatarUrl}
                        alt={getMemberName(member)}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )
                ) : (
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500 text-white font-semibold text-sm">
                    {getInitials(member)}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {getMemberName(member)}
                  </h3>
                  {member.organization && (
                    <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {member.organization.name}
                    </p>
                  )}
                </div>

                <Link
                  href={`/dashboard/profile/${member.id}`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 opacity-0 group-hover:opacity-100 transition whitespace-nowrap"
                >
                  Профиль →
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 p-3">
        <Link
          href="/dashboard/users"
          className="block w-full text-center text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition"
        >
          Показать всех коллег
        </Link>
      </div>
    </div>
  );
}

// Мемоизируем компонент, чтобы избежать лишних рендеров
export default memo(UnionMembersComponent);

