"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import PostFeed from "@/components/posts/PostFeed";
import CreatePost from "@/components/posts/CreatePost";

interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  jobTitle: string | null;
  profession: string | null;
  education: string | null;
  aboutMe: string | null;
  hobbies: string | null;
  createdAt: string;
  isOwnProfile?: boolean;
  organization?: {
    id: string;
    name: string;
    type: string;
  } | null;
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [id]);

  useEffect(() => {
    if (profile) {
      checkSubscription();
    }
  }, [profile]);

  const loadProfile = async () => {
    try {
      const response = await fetch(`/api/profile/${id}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить профиль");
      }
      const data = await response.json();
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  const checkSubscription = async () => {
    if (!profile) return;
    try {
      const response = await fetch(`/api/subscriptions/${profile.id}`);
      if (response.ok) {
        const data = await response.json();
        setIsSubscribed(data.isSubscribed || false);
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  const handleSubscribe = async () => {
    if (!profile) return;
    setIsSubscribing(true);
    try {
      const response = await fetch(`/api/subscriptions/${profile.id}`, {
        method: isSubscribed ? "DELETE" : "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setIsSubscribed(!isSubscribed);
      } else {
        console.error("Error toggling subscription:", data);
        const errorMessage = data.details 
          ? `${data.error}: ${data.details}`
          : data.error || "Ошибка при изменении подписки";
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error toggling subscription:", error);
      alert("Ошибка при изменении подписки. Попробуйте еще раз.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const handleSendMessage = () => {
    // Проверяем, что это не попытка написать самому себе
    if (profile?.isOwnProfile) {
      return;
    }
    router.push(`/dashboard/chat?userId=${profile?.id}`);
  };

  const getUserName = () => {
    if (profile?.firstName && profile?.lastName) {
      const parts = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean);
      return parts.join(" ");
    }
    return profile?.email.split("@")[0] || "Пользователь";
  };

  const getInitials = () => {
    if (profile?.firstName && profile?.lastName) {
      return `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase();
    }
    return profile?.email[0].toUpperCase() || "?";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
    });
  };

  // Генерируем цвет для аватара на основе имени
  const getAvatarGradient = () => {
    const colors = [
      "from-blue-500 to-blue-600",
      "from-purple-500 to-purple-600",
      "from-pink-500 to-pink-600",
      "from-green-500 to-green-600",
      "from-orange-500 to-orange-600",
      "from-indigo-500 to-indigo-600",
    ];
    const colorIndex = (profile?.firstName?.charCodeAt(0) || 0) % colors.length;
    return colors[colorIndex];
  };

  if (loading) {
    return (
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
          <p className="text-red-800 dark:text-red-200">
            {error || "Профиль не найден"}
          </p>
        </div>
        <Link href="/dashboard/news" className={`${backNavLinkButtonClass} mt-4`}>
          ← Вернуться к новостям
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      {/* Кнопка назад */}
      <Link href="/dashboard/users" className={`${backNavLinkButtonClass} mb-4 gap-2`}>
        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад к участникам
      </Link>

      {/* Профиль в стиле LinkedIn */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Баннер (как в LinkedIn) */}
        <div className="h-32 sm:h-40 bg-gray-200 dark:bg-gray-700 relative z-0">
          {/* Можно добавить фоновое изображение позже */}
        </div>

        {/* Основная информация */}
        <div className="px-4 sm:px-6 pb-6">
          {/* Аватар и имя - в стиле LinkedIn */}
          <div className="flex flex-col items-center sm:items-start -mt-16 sm:-mt-20 mb-4 relative z-10">
            {/* Аватар */}
            <div className="mb-4 relative z-10">
              {profile.avatarUrl ? (
                <div className="relative h-32 w-32 sm:h-40 sm:w-40 rounded-full border-4 border-white dark:border-gray-800 shadow-lg overflow-hidden bg-white dark:bg-gray-800">
                  <img
                    src={profile.avatarUrl}
                    alt={getUserName()}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className={`relative h-32 w-32 sm:h-40 sm:w-40 rounded-full border-4 border-white dark:border-gray-800 shadow-lg bg-gradient-to-br ${getAvatarGradient()} flex items-center justify-center text-white font-bold text-4xl sm:text-5xl z-10`}>
                  {getInitials()}
                </div>
              )}
            </div>

            {/* Имя и должность */}
            <div className="w-full text-center sm:text-left mb-4">
              <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 dark:text-white mb-1 break-words">
                {getUserName()}
              </h1>
              {(profile.jobTitle || profile.profession || profile.organization) && (
                <div className="space-y-1">
                  {profile.jobTitle && profile.organization ? (
                    <p className="text-base text-gray-600 dark:text-gray-400">
                      {profile.jobTitle} в {profile.organization.name}
                    </p>
                  ) : profile.profession && profile.organization ? (
                    <p className="text-base text-gray-600 dark:text-gray-400">
                      {profile.profession} в {profile.organization.name}
                    </p>
                  ) : profile.jobTitle ? (
                    <p className="text-base text-gray-600 dark:text-gray-400">
                      {profile.jobTitle}
                    </p>
                  ) : profile.profession ? (
                    <p className="text-base text-gray-600 dark:text-gray-400">
                      {profile.profession}
                    </p>
                  ) : profile.organization ? (
                    <p className="text-base text-gray-600 dark:text-gray-400">
                      {profile.organization.name}
                    </p>
                  ) : null}
                  
                  {profile.jobTitle && profile.profession && profile.jobTitle !== profile.profession && !profile.organization && (
                    <p className="text-sm text-gray-500 dark:text-gray-500">
                      {profile.profession}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Кнопки действий в стиле LinkedIn */}
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {!profile.isOwnProfile && (
                <>
                  <button
                    onClick={handleSendMessage}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-full transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>Написать</span>
                  </button>
                  <button
                    onClick={handleSubscribe}
                    disabled={isSubscribing}
                    className={`px-4 py-2 font-semibold rounded-full transition-colors flex items-center justify-center gap-2 border-2 ${
                      isSubscribed
                        ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400 bg-white dark:bg-gray-800 hover:bg-green-50 dark:hover:bg-green-900/20"
                        : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover-surface"
                    } ${isSubscribing ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {isSubscribing ? "..." : isSubscribed ? "✓ Подписан" : "Подписаться"}
                  </button>
                </>
              )}
              <Link
                href={`/dashboard/profile/${profile.id}/posts`}
                className="px-4 py-2 font-semibold rounded-full transition-colors flex items-center justify-center gap-2 border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover-surface"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Посты</span>
              </Link>
            </div>
          </div>

          {/* Основной контент в стиле LinkedIn */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Левая колонка: Основная информация и посты */}
            <div className="lg:col-span-2 space-y-4">
              {/* Форма создания поста (только для своего профиля) */}
              {profile.isOwnProfile && (
                <div className="mb-4">
                  <CreatePost />
                </div>
              )}
              
              {/* Посты пользователя */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Посты</h2>
                  <Link
                    href={`/dashboard/profile/${profile.id}/posts`}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                  >
                    Все посты →
                  </Link>
                </div>
                <PostFeed userId={profile.id} limit={3} />
              </div>
              {/* О себе */}
              {profile.aboutMe && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    О себе
                  </h3>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {profile.aboutMe}
                  </p>
                </div>
              )}

              {/* Хобби и увлечения */}
              {profile.hobbies && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Хобби и увлечения
                  </h3>
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                    {profile.hobbies}
                  </p>
                </div>
              )}

              {/* Если нет дополнительной информации */}
              {!profile.aboutMe && !profile.hobbies && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                  <p>Дополнительная информация отсутствует</p>
                </div>
              )}
            </div>

            {/* Правая колонка: Боковая панель в стиле LinkedIn */}
            <div className="space-y-4">
              {/* Контактная информация */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Контактная информация
                </h3>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a 
                      href={`mailto:${profile.email}`}
                      className="text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 break-all"
                    >
                      {profile.email}
                    </a>
                  </div>
                  {profile.phone && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <a 
                        href={`tel:${profile.phone}`}
                        className="text-sm text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {profile.phone}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Дополнительная информация */}
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
                  Дополнительно
                </h3>
                <div className="space-y-3">
                  {profile.education && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
                      </svg>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{profile.education}</span>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Член профсоюза с {formatDate(profile.createdAt)}
                    </span>
                  </div>
                  {profile.organization && (
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{profile.organization.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

