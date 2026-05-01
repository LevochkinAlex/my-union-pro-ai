"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import Link from "next/link";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import { getFileUrlWithCDN } from "@/lib/cdn";
import NewsComments from "@/components/dashboard/news/NewsComments";
import styles from "./NewsDetail.module.css";

interface NewsPost {
  id: string;
  title: string;
  content: string;
  coverImage: string | null;
  publishedAt: string | null;
  viewCount: number;
  author: {
    id: string;
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

function formatDate(dateString: string | null): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function getInitials(firstName: string | null, lastName: string | null): string {
  const f = firstName?.charAt(0)?.toUpperCase() || "";
  const l = lastName?.charAt(0)?.toUpperCase() || "";
  return f + l || "А";
}

export default function NewsDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const [news, setNews] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const newsId = params.id as string;

  useEffect(() => {
    if (!newsId) return;

    const fetchNews = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/news/${newsId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError("Новость не найдена");
          } else {
            setError("Ошибка при загрузке новости");
          }
          return;
        }

        const data = await response.json();
        setNews(data);
      } catch (err) {
        console.error("Error fetching news:", err);
        setError("Ошибка при загрузке новости");
      } finally {
        setLoading(false);
      }
    };

    fetchNews();
  }, [newsId]);

  const handleLike = async () => {
    if (!session || !news) return;

    try {
      const response = await fetch(`/api/news/${news.id}/like`, {
        method: "POST",
        credentials: "same-origin",
      });

      if (response.ok) {
        const data = await response.json();
        setNews(prev => prev ? {
          ...prev,
          isLiked: data.liked,
          _count: {
            ...prev._count,
            likes: data.liked ? prev._count.likes + 1 : prev._count.likes - 1,
          },
        } : null);
      }
    } catch (err) {
      console.error("Error toggling like:", err);
    }
  };

  const handlePollVote = async (pollId: string, optionId: string) => {
    if (!session) return;

    try {
      const response = await fetch(`/api/news/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });

      if (response.ok) {
        const data = await response.json();
        const updated = data.poll; // API возвращает { success, poll: { options, totalVotes, userVote, ... } }
        if (!updated) return;
        setNews(prev => {
          if (!prev) return null;
          return {
            ...prev,
            polls: prev.polls.map(poll =>
              poll.id === pollId
                ? {
                    ...poll,
                    options: updated.options ?? poll.options,
                    totalVotes: updated.totalVotes ?? 0,
                    userVote: updated.userVote ?? optionId,
                    isClosed: updated.isClosed ?? poll.isClosed,
                  }
                : poll
            ),
          };
        });
      }
    } catch (err) {
      console.error("Error voting:", err);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
        </div>
      </div>
    );
  }

  if (error || !news) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">{error || "Новость не найдена"}</p>
          <Link href="/dashboard/news" className={backNavLinkButtonClass}>
            ← Вернуться к новостям
          </Link>
        </div>
      </div>
    );
  }

  const authorName =
    (news as any).authorDisplayName ||
    [news.author?.firstName, news.author?.lastName].filter(Boolean).join(" ") ||
    "Автор";

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Навигация */}
      <div className="mb-6">
        <Link href="/dashboard/news" className={`${backNavLinkButtonClass} gap-2`}>
          <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Назад к новостям
        </Link>
      </div>

      {/* Карточка новости */}
      <article className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Обложка */}
        {news.coverImage && (
          <div className="relative w-full aspect-video bg-gray-100 dark:bg-gray-700">
            <Image
              src={
                news.coverImage.startsWith("http")
                  ? news.coverImage
                  : getFileUrlWithCDN(news.coverImage, true)
              }
              alt={news.title}
              fill
              className="object-cover"
              priority
            />
          </div>
        )}

        <div className="p-6">
          {/* Автор и дата */}
          <div className="flex items-center gap-3 mb-4">
            {news.author.avatarUrl ? (
              <div className="relative w-10 h-10 rounded-full overflow-hidden">
                <Image
                  src={
                    news.author.avatarUrl.startsWith("http")
                      ? news.author.avatarUrl
                      : getFileUrlWithCDN(news.author.avatarUrl, true)
                  }
                  alt={authorName}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-medium">
                {getInitials(news.author.firstName, news.author.lastName)}
              </div>
            )}
            <div>
              <p className="font-medium text-gray-900 dark:text-white">{authorName}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {formatDate(news.publishedAt)}
              </p>
            </div>
          </div>

          {/* Заголовок */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            {news.title}
          </h1>

          {/* Контент */}
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
            dangerouslySetInnerHTML={{ __html: news.content }}
          />

          {/* Опросы */}
          {news.polls && news.polls.length > 0 && (
            <div className="mt-6 space-y-4">
              {news.polls.map((poll) => (
                <div
                  key={poll.id}
                  className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4"
                >
                  <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                    {poll.question}
                  </h4>
                  <div className="space-y-2">
                    {poll.options.map((option) => {
                      const isVoted = poll.userVote === option.id;
                      const hasVoted = poll.userVote !== null;
                      const percentage = option.percentage || 0;

                      return (
                        <button
                          key={option.id}
                          onClick={() => !hasVoted && !poll.isClosed && handlePollVote(poll.id, option.id)}
                          disabled={hasVoted || poll.isClosed}
                          className={`w-full relative overflow-hidden rounded-lg border transition-all ${
                            isVoted
                              ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                              : hasVoted || poll.isClosed
                              ? "border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                              : "border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-600 cursor-pointer"
                          }`}
                        >
                          {hasVoted && (
                            <div
                              className={`absolute inset-0 bg-blue-100 dark:bg-blue-900/30 transition-all ${styles[`pollFill${Math.round(percentage)}` as keyof typeof styles] ?? styles.pollFill0}`}
                            />
                          )}
                          <div className="relative px-4 py-2 flex items-center justify-between">
                            <span className="text-sm text-gray-900 dark:text-white">
                              {option.text}
                            </span>
                            {hasVoted && (
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                {percentage}%
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  {poll.totalVotes > 0 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Всего голосов: {poll.totalVotes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Статистика и действия */}
          <div className="flex items-center gap-4 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="relative group">
              <button
                onClick={handleLike}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  news.isLiked
                    ? "text-rose-600 bg-rose-50 dark:bg-rose-900/20"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                <svg className="w-5 h-5" fill={news.isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
                <span className="font-medium">{news._count.likes}</span>
              </button>
              {/* Tooltip с аватарами пользователей, которые поставили лайк - будет добавлен через компонент */}
            </div>

            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="font-medium">{news._count.comments}</span>
            </div>

            <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 ml-auto">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span>{news.viewCount}</span>
            </div>
          </div>
        </div>

        {/* Комментарии */}
        <div className="border-t border-gray-200 dark:border-gray-700">
          <NewsComments newsId={news.id} />
        </div>
      </article>
    </div>
  );
}
