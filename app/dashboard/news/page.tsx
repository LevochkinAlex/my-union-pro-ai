"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import NewsCard from "@/components/dashboard/news/NewsCard";
import NewsChannels from "@/components/dashboard/news/NewsChannels";
import UnionMembers from "@/components/dashboard/news/UnionMembers";

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
    email: string;
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
    options: any[];
    totalVotes: number;
    userVote: string | null;
    isClosed: boolean;
  }>;
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false); // Ref для предотвращения дублирования
  const loadNewsRef = useRef<((pageNum?: number) => Promise<void>) | null>(null);

  const loadNews = useCallback(async (pageNum = 1) => {
    // Предотвращаем повторные запросы через ref
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setIsLoadingMore(true);
      }

      const response = await fetch(`/api/news?page=${pageNum}&limit=10`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить новости");
      }
      const data = await response.json();
      
      if (pageNum === 1) {
        setNews(data.news || []);
      } else {
        setNews((prev) => [...prev, ...(data.news || [])]);
      }
      
      setHasMore(data.pagination.page < data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, []);

  // Сохраняем функцию в ref для использования в IntersectionObserver
  useEffect(() => {
    loadNewsRef.current = loadNews;
  }, [loadNews]);

  // Загружаем первую страницу только один раз
  useEffect(() => {
    loadNews();
  }, []);

  // Infinite scroll с Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Если элемент виден И есть еще новости И не идет загрузка
        if (entries[0].isIntersecting && hasMore && !loading && !isLoadingMore && !isLoadingRef.current) {
          const nextPage = page + 1;
          setPage(nextPage);
          loadNewsRef.current?.(nextPage);
        }
      },
      { threshold: 0.1 } // Срабатывает когда 10% элемента видно
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loading, isLoadingMore, page]); // Убрали loadNews из зависимостей

  const handleLikeToggle = async (newsId: string) => {
    try {
      const response = await fetch(`/api/news/${newsId}/like`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Не удалось поставить лайк");
      }

      const data = await response.json();

      setNews((prev) =>
        prev.map((post) =>
          post.id === newsId
            ? {
                ...post,
                isLiked: data.liked,
                _count: {
                  ...post._count,
                  likes: data.count,
                },
              }
            : post
        )
      );
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const handlePollVote = async (pollId: string, optionId: string) => {
    try {
      const response = await fetch(`/api/news/polls/${pollId}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ optionId }),
      });

      if (!response.ok) {
        throw new Error("Не удалось проголосовать");
      }

      const data = await response.json();

      // Обновляем новость с новыми данными опроса
      setNews((prev) =>
        prev.map((post) => ({
          ...post,
          polls: post.polls.map((poll) =>
            poll.id === pollId ? data.poll : poll
          ),
        }))
      );
    } catch (err) {
      console.error("Failed to vote:", err);
      alert(err instanceof Error ? err.message : "Произошла ошибка");
    }
  };

  if (loading && news.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600 dark:text-gray-400">Загрузка новостей...</div>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {/* Макет с 2 колонками на широких экранах */}
      <div className="flex gap-6 max-w-full">
        {/* Основная лента новостей */}
        <div className="flex-1 w-full">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Новости
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Следите за последними новостями профсоюза
            </p>
          </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
            {error}
          </div>
        )}

        {loading && news.length === 0 ? (
          <div className="flex justify-center items-center py-20">
            <div className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <svg
                className="animate-spin h-8 w-8"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <span className="text-lg">Загрузка новостей...</span>
            </div>
          </div>
        ) : news.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
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
            <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
              Новостей пока нет
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Новые новости появятся здесь
            </p>
          </div>
        ) : (
        <>
          <div className="space-y-6">
            {news.map((post) => (
              <NewsCard
                key={post.id}
                post={post}
                onLikeToggle={handleLikeToggle}
                onPollVote={handlePollVote}
              />
            ))}
          </div>

          {/* Триггер для infinite scroll */}
          {hasMore && (
            <div ref={observerTarget} className="flex justify-center py-8">
              {isLoadingMore && (
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span className="text-sm">Загрузка...</span>
                </div>
              )}
            </div>
          )}

          {/* Сообщение когда все новости загружены */}
          {!hasMore && news.length > 0 && (
            <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
              Все новости загружены
            </div>
          )}
        </>
      )}
        </div>

        {/* Правый сайдбар - фиксированный на широких экранах */}
        <aside className="hidden xl:block w-80 flex-shrink-0">
          <div className="sticky top-6 space-y-4">
            <NewsChannels />
            <UnionMembers />
          </div>
        </aside>
      </div>
    </div>
  );
}

