"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Heart } from "lucide-react";
import clsx from "clsx";
import { normalizeUserAvatar } from "@/lib/api-helpers";

interface LikeUser {
  id: string;
  userId: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
    email: string;
  };
}

interface ChannelLikesProps {
  postId: string;
  isOwn: boolean;
  initialCount?: number;
  isLiked?: boolean;
  onLikeToggle?: (liked: boolean, count: number) => void;
}

export default function ChannelLikes({ 
  postId, 
  isOwn, 
  initialCount = 0,
  isLiked: initialIsLiked = false,
  onLikeToggle
}: ChannelLikesProps) {
  const { data: session } = useSession();
  const [isLiked, setIsLiked] = useState(initialIsLiked);
  const [likesCount, setLikesCount] = useState(initialCount);
  const [likes, setLikes] = useState<LikeUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [showFullList, setShowFullList] = useState(false);

  useEffect(() => {
    setIsLiked(initialIsLiked);
    setLikesCount(initialCount);
  }, [initialIsLiked, initialCount]);

  const loadLikes = async () => {
    if (loading || likesCount === 0) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/news/${postId}/likes`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить лайки");
      }
      const data = await response.json();
      setLikes(data.likes || []);
    } catch (err) {
      console.error("Failed to load likes:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    try {
      const response = await fetch(`/api/news/${postId}/like`, {
        method: "POST",
        credentials: "same-origin",
      });
      
      if (response.ok) {
        const data = await response.json();
        setIsLiked(data.liked);
        setLikesCount(data.count);
        onLikeToggle?.(data.liked, data.count);
        
        // Обновляем список лайков
        if (data.liked) {
          // Если поставили лайк, нужно обновить список
          loadLikes();
        } else {
          // Если убрали лайк, удаляем из списка
          // Нужно получить userId из сессии
          const sessionResponse = await fetch('/api/auth/session');
          if (sessionResponse.ok) {
            const session = await sessionResponse.json();
            setLikes(prev => prev.filter(like => like.userId !== session?.user?.id));
          }
        }
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  const getUserDisplayName = (user: LikeUser['user']): string => {
    const parts = [user.lastName, user.firstName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : user.email || "Пользователь";
  };

  // Показываем максимум 5 аватарок
  const displayLikes = showFullList ? likes : likes.slice(0, 5);
  const remainingCount = likes.length > 5 ? likes.length - 5 : 0;

  return (
    <div className="relative">
      <button
        onClick={handleLike}
        onMouseEnter={() => {
          if (likesCount > 0) {
            loadLikes();
            setShowTooltip(true);
          }
        }}
        onMouseLeave={() => setShowTooltip(false)}
        className={clsx(
          "flex items-center gap-1.5 text-xs transition-colors group relative",
          isLiked 
            ? isOwn 
              ? 'text-white' 
              : 'text-red-500 dark:text-red-400'
            : isOwn 
              ? 'text-white/70 hover:text-white' 
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        )}
      >
        <Heart className={clsx("w-3.5 h-3.5", isLiked && "fill-current")} />
        <span>{likesCount}</span>

        {/* Tooltip с аватарами пользователей */}
        {showTooltip && likes.length > 0 && (
          <div className={clsx(
            "absolute bottom-full left-0 mb-2 z-50 rounded-lg shadow-lg border p-3 min-w-[200px] max-w-[300px]",
            isOwn 
              ? 'bg-gray-800 border-gray-700' 
              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
          )}>
            <div className="space-y-2">
              <div className={clsx(
                "text-xs font-semibold mb-2",
                isOwn ? 'text-white/90' : 'text-gray-900 dark:text-white'
              )}>
                {likesCount === 1 ? '1 лайк' : `${likesCount} лайков`}
              </div>
              
              <div className="space-y-1.5">
                {displayLikes.map((like) => {
                  const normalized = normalizeUserAvatar(like.user);
                  return (
                    <div
                      key={like.id}
                      className="flex items-center gap-2"
                    >
                      <img
                        src={normalized.avatarUrl || "/default-avatar.png"}
                        alt={getUserDisplayName(like.user)}
                        className="w-6 h-6 rounded-full flex-shrink-0"
                      />
                      <span className={clsx(
                        "text-xs truncate flex-1",
                        isOwn ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'
                      )}>
                        {getUserDisplayName(like.user)}
                      </span>
                    </div>
                  );
                })}
                
                {remainingCount > 0 && !showFullList && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowFullList(true);
                    }}
                    className={clsx(
                      "text-xs font-medium w-full text-left pt-1",
                      isOwn ? 'text-white/70 hover:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    )}
                  >
                    Показать еще {remainingCount} {remainingCount === 1 ? 'лайк' : 'лайков'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </button>
    </div>
  );
}
