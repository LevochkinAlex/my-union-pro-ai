"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

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
}

export default function UserCard({ user }: UserCardProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  
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

  // Проверяем статус подписки при загрузке
  useEffect(() => {
    checkSubscriptionStatus();
  }, [user.id]);

  const checkSubscriptionStatus = async () => {
    try {
      const response = await fetch(`/api/subscriptions/${user.id}`);
      if (response.ok) {
        const data = await response.json();
        setIsSubscribed(data.isSubscribed || false);
      }
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  const handleSubscribe = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsLoading(true);
    try {
      const response = await fetch(`/api/subscriptions/${user.id}`, {
        method: isSubscribed ? "DELETE" : "POST",
      });

      if (response.ok) {
        setIsSubscribed(!isSubscribed);
        showToast(isSubscribed ? "Подписка отменена" : "Подписка оформлена", "success");
      } else {
        const error = await response.json();
        showToast(error.error || "Ошибка при изменении подписки", "error");
      }
    } catch (error) {
      console.error("Error toggling subscription:", error);
      showToast("Ошибка при изменении подписки", "error");
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Link href={`/dashboard/profile/${user.id}`}>
      <div className="group bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer">
        {/* Card Header with Avatar */}
        <div className="relative pt-8 pb-4 px-6 text-center">
          {/* Background decoration */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-800"></div>
          
          {/* Avatar */}
          <div className="relative z-10 flex justify-center mb-3">
            {user.avatarUrl && !avatarError ? (
              <div className="relative h-24 w-24 rounded-full overflow-hidden ring-4 ring-white dark:ring-gray-800 shadow-lg group-hover:ring-blue-500 dark:group-hover:ring-blue-400 transition-all">
                <img
                  src={user.avatarUrl}
                  alt={fullName}
                  className="h-full w-full object-cover"
                  onError={() => {
                    setAvatarError(true);
                  }}
                />
              </div>
            ) : (
              <div className={`h-24 w-24 rounded-full bg-gradient-to-br ${avatarGradient} flex items-center justify-center text-white font-bold text-2xl ring-4 ring-white dark:ring-gray-800 shadow-lg`}>
                {initials}
              </div>
            )}
          </div>
          
          {/* Name */}
          <h3 className="relative z-10 font-semibold text-gray-900 dark:text-white text-lg mb-1">
            {fullName}
          </h3>
          
          {/* Job Title */}
          {user.jobTitle && (
            <p className="relative z-10 text-sm text-gray-600 dark:text-gray-400 mb-1">
              {user.jobTitle}
            </p>
          )}
          
          {/* Profession */}
          {user.profession && (
            <p className="relative z-10 text-sm text-gray-500 dark:text-gray-500 mb-1">
              {user.profession}
            </p>
          )}
          
          {/* Organization */}
          {user.organization?.name && (
            <p className="relative z-10 text-sm text-gray-500 dark:text-gray-500 mb-2">
              {user.organization.name}
            </p>
          )}
          
          {/* Join Date */}
          <div className="relative z-10">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
              Присоединился {new Date(user.createdAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "short",
              })}
            </span>
          </div>
        </div>
        
        {/* Card Footer with Action Button */}
        <div className="px-6 pb-6 pt-2 border-t border-gray-100 dark:border-gray-700/50">
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

