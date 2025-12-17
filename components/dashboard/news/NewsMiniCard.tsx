"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

interface NewsMiniCardProps {
  post: {
    id: string;
    title: string;
    content: string;
    coverImage: string | null;
    publishedAt: string | null;
    viewCount: number;
    author: {
      firstName: string | null;
      lastName: string | null;
      avatarUrl: string | null;
    };
    _count: {
      likes: number;
      comments: number;
    };
  };
  priority?: boolean; // Для первых изображений - приоритетная загрузка
}

// Форматирование даты
function formatDate(dateString: string | null): string {
  if (!dateString) return "";
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
    month: "long",
    year: "numeric",
  }).replace(" г.", " г.");
}

// Очистка HTML и обрезка текста
function getPlainText(html: string, maxLength: number = 120): string {
  const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

// Получение инициалов
function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() || "";
  const l = lastName?.charAt(0)?.toUpperCase() || "";
  return f + l || "А";
}

export default function NewsMiniCard({ post, priority = false }: NewsMiniCardProps) {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  const authorName = [post.author.firstName, post.author.lastName].filter(Boolean).join(" ") || "Автор";
  const plainText = getPlainText(post.content);
  // Показываем дату только после монтирования чтобы избежать hydration mismatch
  const formattedDate = mounted ? formatDate(post.publishedAt) : "";

  return (
    <Link href={`/dashboard/news?id=${post.id}`} className="block h-full">
      <article className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden h-full hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all duration-200 cursor-pointer flex flex-col">
        {/* Обложка - оптимизирована с Next.js Image */}
        {post.coverImage && !post.coverImage.startsWith("data:") && (
          <div className="relative w-full h-32 overflow-hidden bg-gray-100 dark:bg-gray-700">
            <Image
              src={(() => {
                if (post.coverImage.startsWith("http")) {
                  return post.coverImage;
                }
                const { getFileUrlWithCDN } = require("@/lib/cdn");
                return getFileUrlWithCDN(post.coverImage, true);
              })()}
              alt={post.title}
              fill
              sizes="(max-width: 768px) 100vw, 300px"
              className="object-cover"
              loading={priority ? "eager" : "lazy"}
              priority={priority}
              quality={75}
            />
          </div>
        )}

        <div className="p-4 flex flex-col flex-1">
          {/* Автор и дата */}
          <div className="flex items-center gap-2 mb-2">
            {post.author.avatarUrl && !post.author.avatarUrl.startsWith("data:") ? (
              <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                <Image
                  src={(() => {
                    if (post.author.avatarUrl!.startsWith("http")) {
                      return post.author.avatarUrl!;
                    }
                    const { getFileUrlWithCDN } = require("@/lib/cdn");
                    return getFileUrlWithCDN(post.author.avatarUrl!, true);
                  })()}
                  alt={authorName}
                  width={24}
                  height={24}
                  className="object-cover"
                  loading="lazy"
                  quality={60}
                />
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium text-[10px] flex-shrink-0">
                {getInitials(post.author.firstName, post.author.lastName)}
              </div>
            )}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                {authorName}
              </span>
              <span className="text-gray-300 dark:text-gray-600">•</span>
              <span className="text-xs text-gray-500 dark:text-gray-500 whitespace-nowrap">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* Заголовок */}
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm line-clamp-2 mb-2 leading-snug">
            {post.title}
          </h3>

          {/* Контент */}
          <p className="text-gray-600 dark:text-gray-400 text-xs line-clamp-2 flex-1 leading-relaxed">
            {plainText}
          </p>

          {/* Статистика */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            {/* Лайки */}
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium">{post._count.likes}</span>
            </div>

            {/* Комментарии */}
            <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-xs font-medium">{post._count.comments}</span>
            </div>

            {/* Просмотры */}
            {post.viewCount > 0 && (
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
      </article>
    </Link>
  );
}

