"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";
import * as Sentry from "@sentry/nextjs";

interface UserCardProps {
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
    profession: string | null;
    organization: {
      name: string;
    } | null;
    createdAt: Date;
  };
  hideOrganization?: boolean;
}

export default function UserCard({ user, hideOrganization = false }: UserCardProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();
  
  const fullName = `${user.firstName || ""} ${user.middleName || ""} ${user.lastName || ""}`.trim() || "Пользователь";
  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : user.firstName?.[0] || user.lastName?.[0] || "U";
  
  // Генерируем цвет для аватара на основе имени
  const colors = [
    "from-blue-500 to-blue-600",
    "from-purple-500 to-purple-600",
    "from-pink-500 to-pink-600",
    "from-green-500 to-green-600",
    "from-orange-500 to-orange-600",
    "from-indigo-500 to-indigo-600",
  ];
  const colorIndex = (user.firstName?.charCodeAt(0) || 0) % colors.length;
  const avatarGradient = colors[colorIndex];
  
  // Проверяем валидность avatarUrl
  const hasValidAvatar = user.avatarUrl && 
    user.avatarUrl.trim() !== "" && 
    (user.avatarUrl.startsWith('http://') || 
     user.avatarUrl.startsWith('https://') || 
     user.avatarUrl.startsWith('data:') || 
     user.avatarUrl.startsWith('/'));

  // Проверяем статус подписки сразу при монтировании компонента
  useEffect(() => {
    checkSubscriptionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Проверяем статус подписки
  const checkSubscriptionStatus = async () => {
    if (subscriptionChecked || isLoading) return; // Уже проверяли или идет загрузка
    
    setSubscriptionChecked(true);
    try {
      const response = await fetch(`/api/subscriptions/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setIsSubscribed(data.isSubscribed || false);
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
      setSubscriptionChecked(false); // Разрешаем повторную попытку при ошибке
    }
  };

  const handleSubscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Проверяем статус перед действием, если еще не проверяли
    if (!subscriptionChecked) {
      await checkSubscriptionStatus();
    }
    
    return Sentry.startSpan(
      {
        op: "ui.click",
        name: "UserCard Subscribe Button",
      },
      async (span) => {
        span.setAttribute("userId", user.id);
        span.setAttribute("action", isSubscribed ? "unsubscribe" : "subscribe");
        
        setIsLoading(true);
        try {
          const response = await fetch(`/api/subscriptions/${user.id}`, {
            method: isSubscribed ? "DELETE" : "POST",
          });

          if (response.ok) {
            setIsSubscribed(!isSubscribed);
            span.setAttribute("success", true);
            showToast(isSubscribed ? "Подписка отменена" : "Подписка оформлена", "success");
          } else {
            const error = await response.json();
            span.setAttribute("success", false);
            span.setAttribute("error", error.error || "Unknown error");
            showToast(error.error || "Ошибка при изменении подписки", "error");
          }
        } catch (error) {
          Sentry.captureException(error);
          span.setAttribute("success", false);
          console.error("Error toggling subscription:", error);
          showToast("Ошибка при изменении подписки", "error");
        } finally {
          setIsLoading(false);
        }
      }
    );
  };
  
  return (
    <Link href={`/dashboard/profile/${user.id}`} className="block w-full">
      <div className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all overflow-hidden cursor-pointer w-full p-4">
        {/* Вертикальная раскладка */}
        <div className="flex flex-col items-center text-center gap-3">
          {/* Avatar - по центру сверху */}
          <div className="flex-shrink-0">
            {hasValidAvatar && !avatarError ? (
              <div className="relative h-[72px] w-[72px] rounded-full overflow-hidden ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-blue-500 dark:group-hover:ring-blue-400 transition-all">
                <Image
                  src={user.avatarUrl!}
                  alt={fullName}
                  width={72}
                  height={72}
                  className="h-full w-full object-cover"
                  loading="lazy"
                  quality={75}
                  onError={() => {
                    setAvatarError(true);
                  }}
                />
              </div>
            ) : (
              <div className={`h-[72px] w-[72px] rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white font-semibold text-xl ring-2 ring-gray-200 dark:ring-gray-700 group-hover:ring-blue-500 dark:group-hover:ring-blue-400 transition-all`}>
                {initials}
              </div>
            )}
          </div>
          
          {/* User Info - по центру */}
          <div className="w-full space-y-1">
            {/* Name */}
            <h3 className="font-semibold text-gray-900 dark:text-white text-base truncate">
              {fullName}
            </h3>
            
            {/* Job Title */}
            {user.jobTitle && (
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {user.jobTitle}
              </p>
            )}
            
            {/* Profession and Organization */}
            {(user.profession || (user.organization?.name && !hideOrganization)) && (
              <p className="text-xs text-gray-500 dark:text-gray-500 truncate">
                {user.profession}
                {user.profession && user.organization?.name && !hideOrganization && " • "}
                {user.organization?.name && !hideOrganization && user.organization.name}
              </p>
            )}
            
            {/* Join Date */}
            <div className="pt-1">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                Присоединился {new Date(user.createdAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </div>
          </div>
          
          {/* Action Button - снизу на всю ширину */}
          <button
            onClick={handleSubscribe}
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-lg border font-medium text-sm transition-colors ${
              isSubscribed
                ? "border-green-600 text-green-600 dark:border-green-400 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30"
                : "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
            } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {isLoading ? "..." : isSubscribed ? "✓ Подписан" : "Подписаться"}
          </button>
        </div>
      </div>
    </Link>
  );
}

