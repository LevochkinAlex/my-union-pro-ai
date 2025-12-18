"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import clsx from "clsx";
import NewsComments from "./NewsComments";
import { getFileUrlWithCDN } from "@/lib/cdn";

interface NewsPost {
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
  isLiked: boolean;
  polls: Array<{
    id: string;
    question: string;
    options: Array<{
      id: string;
      text: string;
      voteCount?: number;
      percentage?: number;
    }>;
    totalVotes: number;
    userVote: string | null;
    isClosed: boolean;
  }>;
}

interface NewsCardProps {
  post: NewsPost;
  onLikeToggle: (newsId: string) => void;
  onPollVote: (pollId: string, optionId: string) => void;
  priority?: boolean; // Для первых изображений - приоритетная загрузка
}

export default function NewsCard({
  post,
  onLikeToggle,
  onPollVote,
  priority = false,
}: NewsCardProps) {
  const router = useRouter();
  const [showComments, setShowComments] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [localViewCount, setLocalViewCount] = useState(post.viewCount);
  const [displayContent, setDisplayContent] = useState(post.content);
  const [mounted, setMounted] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const hasIncrementedView = useRef(false);

  // Отслеживание видимости карточки для инкремента просмотров
  // Устанавливаем mounted состояние
  useEffect(() => {
    setMounted(true);
  }, []);

  // Функция для извлечения текста из HTML (работаем на сервере и клиенте)
  const getTextFromHTML = (html: string) => {
    // Проверяем, что мы на клиенте
    if (typeof document !== "undefined") {
      const div = document.createElement("div");
      div.innerHTML = html;
      return div.textContent || div.innerText || "";
    }
    // На сервере используем регулярные выражения
    return html
      .replace(/<[^>]*>/g, " ") // Удаляем HTML теги
      .replace(/\s+/g, " ") // Заменяем множественные пробелы на один
      .trim();
  };

  // Функция для сокращения HTML контента
  const getTruncatedHTML = (html: string, maxLength: number) => {
    const text = getTextFromHTML(html);
    if (text.length <= maxLength) return html;
    
    // Обрезаем текст
    const truncatedText = text.substring(0, maxLength);
    // Ищем последний пробел чтобы не обрезать слово
    const lastSpace = truncatedText.lastIndexOf(' ');
    const finalText = lastSpace > 0 ? truncatedText.substring(0, lastSpace) : truncatedText;
    
    return `<p>${finalText}...</p>`;
  };

  // Вычисляем needsTruncation
  const textContent = getTextFromHTML(post.content);
  const needsTruncation = textContent.length > 300;

  // Вычисляем displayContent после монтирования на клиенте
  useEffect(() => {
    if (mounted) {
      // Если контент развернут или не требует обрезки - показываем полностью
      const content = needsTruncation && !isExpanded
        ? getTruncatedHTML(post.content, 300)
        : post.content;
      
      setDisplayContent(content);
    } else {
      // На сервере показываем сокращенный контент для SEO и быстрой загрузки
      setDisplayContent(needsTruncation ? getTruncatedHTML(post.content, 300) : post.content);
    }
  }, [mounted, post.content, isExpanded, needsTruncation]);

  useEffect(() => {
    if (!cardRef.current || hasIncrementedView.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Когда карточка становится видимой (более 50% в видимой области)
          if (entry.isIntersecting && !hasIncrementedView.current) {
            hasIncrementedView.current = true;
            
            // Увеличиваем счётчик просмотров
            fetch(`/api/news/${post.id}/view`, {
              method: "POST",
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.viewCount) {
                  setLocalViewCount(data.viewCount);
                }
              })
              .catch((err) => {
                console.error("Failed to increment view count:", err);
              });
          }
        });
      },
      {
        threshold: 0.5, // Срабатывает когда 50% карточки видно
      }
    );

    observer.observe(cardRef.current);

    return () => {
      observer.disconnect();
    };
  }, [post.id]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "недавно";
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) {
      return `${diffMinutes || 1} мин назад`;
    }
    if (diffHours < 24) {
      return `${diffHours} ч назад`;
    }
    if (diffDays < 7) {
      return `${diffDays} дн назад`;
    }
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const authorName =
    post.author.firstName && post.author.lastName
      ? `${post.author.firstName} ${post.author.lastName}`
      : "Автор";

  return (
    <article ref={cardRef} className="rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      {/* Header */}
      <div className="p-4 sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          {/* Author Avatar */}
          {post.author.avatarUrl ? (
            post.author.avatarUrl.startsWith('data:') ? (
              <div className="h-10 w-10 rounded-full overflow-hidden flex-shrink-0">
                <img
                  src={post.author.avatarUrl}
                  alt={authorName}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="relative h-10 w-10 rounded-full overflow-hidden flex-shrink-0">
                <img
                  src={
                    post.author.avatarUrl.startsWith("http") || post.author.avatarUrl.startsWith("https")
                      ? post.author.avatarUrl
                      : getFileUrlWithCDN(post.author.avatarUrl, true)
                  }
                  alt={authorName}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    // Тихо скрываем изображение и родительский контейнер при ошибке загрузки
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const parent = target.parentElement;
                    if (parent) {
                      parent.style.display = 'none';
                    }
                  }}
                />
              </div>
            )
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600 text-sm font-semibold dark:bg-blue-900/30 dark:text-blue-400 flex-shrink-0">
              {authorName.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {authorName}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatDate(post.publishedAt)}
            </p>
          </div>
        </div>

        {/* Cover Image */}
        {post.coverImage && (
          <div className="mb-4 -mx-4 sm:-mx-6 bg-gray-100 dark:bg-gray-700">
            <img
              src={
                post.coverImage.startsWith("data:") || post.coverImage.startsWith("http") || post.coverImage.startsWith("https")
                  ? post.coverImage
                  : getFileUrlWithCDN(post.coverImage, true)
              }
              alt={post.title}
              className="w-full h-auto max-h-96 object-cover"
              loading={priority ? "eager" : "lazy"}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              onError={(e) => {
                // Тихо скрываем изображение, если оно не найдено
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                // Скрываем родительский div, если изображение не загрузилось
                const parent = target.parentElement;
                if (parent) {
                  parent.style.display = 'none';
                }
              }}
            />
          </div>
        )}

        {/* Title */}
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
          {post.title}
        </h2>

        {/* Content */}
        <div
          className="news-content mb-2 text-gray-700 dark:text-gray-300"
          dangerouslySetInnerHTML={{ __html: displayContent }}
        />

        {/* Кнопка "показать больше" / "скрыть" */}
        {needsTruncation && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 mb-4 transition-colors"
          >
            {isExpanded ? "Скрыть" : "Показать полностью"}
          </button>
        )}

        {/* Polls */}
        {post.polls.length > 0 && (
          <div className="space-y-4 mb-4">
            {post.polls.map((poll) => (
              <div
                key={poll.id}
                className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
              >
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  {poll.question}
                </h3>
                <div className="space-y-2">
                  {poll.options.map((option) => {
                    const isVoted = poll.userVote === option.id;
                    const percentage = option.percentage || 0;
                    const voteCount = option.voteCount || 0;

                    return (
                      <button
                        key={option.id}
                        onClick={() => {
                          if (!poll.isClosed && !poll.userVote) {
                            onPollVote(poll.id, option.id);
                          }
                        }}
                        disabled={poll.isClosed || !!poll.userVote}
                        className={clsx(
                          "relative w-full rounded-lg border p-3 text-left text-sm transition",
                          isVoted
                            ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                            : poll.userVote
                            ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
                            : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-blue-600",
                          (poll.isClosed || poll.userVote) && "cursor-default"
                        )}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {option.text}
                          </span>
                          {poll.totalVotes > 0 && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {percentage}% ({voteCount})
                            </span>
                          )}
                        </div>
                        {poll.totalVotes > 0 && (
                          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full bg-blue-500 transition-all dark:bg-blue-400"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {poll.totalVotes > 0 && (
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Всего голосов: {poll.totalVotes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => onLikeToggle(post.id)}
            className={clsx(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition",
              post.isLiked
                ? "text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                : "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            )}
          >
            <svg
              className={clsx("h-5 w-5", {
                "fill-current": post.isLiked,
              })}
              fill={post.isLiked ? "currentColor" : "none"}
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
            <span>{post._count.likes}</span>
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <span>{post._count.comments}</span>
          </button>

          {/* Просмотры */}
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-500">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            <span>{localViewCount.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <NewsComments newsId={post.id} />
        </div>
      )}
    </article>
  );
}

