"use client";

import { useState, useEffect } from "react";
import NewsCard from "@/components/dashboard/news/NewsCard";

interface NewsPost {
  id: string;
  title: string;
  content: string;
  coverImage: string | null;
  publishedAt: string | null;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
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

  useEffect(() => {
    loadNews();
  }, []);

  const loadNews = async (pageNum = 1) => {
    try {
      setLoading(true);
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
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    loadNews(nextPage);
  };

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Новости
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Следите за последними новостями профсоюза
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      {news.length === 0 ? (
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

          {hasMore && (
            <div className="flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                {loading ? "Загрузка..." : "Загрузить еще"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

