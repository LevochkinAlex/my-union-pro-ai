"use client";

import Link from "next/link";
import Image from "next/image";

interface PostMiniCardProps {
  post: {
    id: string;
    content: string;
    author: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      middleName: string | null;
      avatarUrl: string | null;
    };
    likesCount: number;
    commentsCount: number;
    viewCount?: number;
    createdAt: string;
  };
}

// Форматирование даты
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "только что";
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн. назад`;

  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  }).replace(".", "");
}

// Очистка HTML и обрезка текста
function getPlainText(html: string, maxLength: number = 150): string {
  // Удаляем HTML теги
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

// Получение инициалов
function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() || "";
  const l = lastName?.charAt(0)?.toUpperCase() || "";
  return f + l || "?";
}

// Получение полного имени
function getFullName(author: PostMiniCardProps["post"]["author"]): string {
  const parts = [author.firstName, author.middleName, author.lastName].filter(Boolean);
  return parts.join(" ") || "Пользователь";
}

export default function PostMiniCard({ post }: PostMiniCardProps) {
  const authorName = getFullName(post.author);
  const plainText = getPlainText(post.content);
  const formattedDate = formatDate(post.createdAt);

  return (
    <Link 
      href={`/posts/${post.id}`}
      className="block h-full"
    >
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 h-full hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 cursor-pointer flex flex-col">
        {/* Автор и дата */}
        <Link 
          href={`/dashboard/profile/${post.author.id}`}
          className="flex items-center gap-3 mb-3 hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {post.author.avatarUrl ? (
            <Image
              src={post.author.avatarUrl}
              alt={authorName}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-sm flex-shrink-0">
              {getInitials(post.author.firstName, post.author.lastName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
              {authorName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formattedDate}
            </p>
          </div>
        </Link>

        {/* Контент */}
        <div className="flex-1 min-h-0">
          <p className="text-gray-700 dark:text-gray-300 text-sm line-clamp-3 leading-relaxed">
            {plainText}
          </p>
        </div>

        {/* Статистика */}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          {/* Лайки */}
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium">{post.likesCount || 0}</span>
          </div>

          {/* Комментарии */}
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-xs font-medium">{post.commentsCount || 0}</span>
          </div>

          {/* Просмотры */}
          {post.viewCount !== undefined && post.viewCount > 0 && (
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 ml-auto">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="text-xs font-medium">{post.viewCount}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

