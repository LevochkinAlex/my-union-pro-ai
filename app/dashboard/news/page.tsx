"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import NewsCard from "@/components/dashboard/news/NewsCard";
import NewsCardSkeleton from "@/components/dashboard/news/NewsCardSkeleton";
import NewsChannels from "@/components/dashboard/news/NewsChannels";
import UnionMembers from "@/components/dashboard/news/UnionMembers";
import PPOHeadNewsPage from "./ppo-head/page";
import { MembershipGate } from "@/components/MembershipGate";
import { useMembershipAccess } from "@/hooks/useMembershipAccess";
import { DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";
import { isChairmanView } from "@/lib/session-user";
import { alertError } from "@/lib/alert";
import { Card, PageHeader, EmptyState, Spinner } from "@/components/ui";

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

/** Лента новостей для участников (без раннего return, чтобы не ломать правила хуков) */
function MemberNewsFeed() {
  const [news, setNews] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const observerTarget = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const loadNewsRef = useRef<((pageNum?: number) => Promise<void>) | null>(null);

  const loadNews = useCallback(async (pageNum = 1, retryCount = 0, channelIdFilter?: string | null) => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    const channelId = channelIdFilter !== undefined ? channelIdFilter : selectedChannelId;

    try {
      if (pageNum === 1) {
        setLoading(true);
        setError("");
      } else {
        setIsLoadingMore(true);
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const params = new URLSearchParams({ page: String(pageNum), limit: "10" });
        if (channelId) params.set("channelId", channelId);
        const response = await fetch(`/api/news?${params.toString()}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache',
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
      if (!response.ok) {
          // Если ошибка сервера, пробуем повторить запрос
          if (response.status >= 500 && retryCount < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1))); // Экспоненциальная задержка
            isLoadingRef.current = false;
            return loadNews(pageNum, retryCount + 1);
          }
          throw new Error(`Не удалось загрузить новости (${response.status})`);
      }
        
      const data = await response.json();
        
        // Проверяем структуру ответа
        if (!data || !Array.isArray(data.news)) {
          throw new Error("Неверный формат данных");
        }
      
      if (pageNum === 1) {
        setNews(data.news || []);
      } else {
        setNews((prev) => [...prev, ...(data.news || [])]);
      }
      
        setHasMore(data.pagination?.page < data.pagination?.totalPages);
        setError(""); // Очищаем ошибку при успешной загрузке
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        
        // Если это ошибка timeout или сетевой ошибка, пробуем повторить
        if ((fetchError.name === 'AbortError' || fetchError.message?.includes('fetch')) && retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          isLoadingRef.current = false;
          return loadNews(pageNum, retryCount + 1);
        }
        
        throw fetchError;
      }
    } catch (err) {
      console.error("[NewsPage] Error loading news:", err);
      const errorMessage = err instanceof Error 
        ? (err.name === 'AbortError' 
          ? "Превышено время ожидания. Проверьте соединение с интернетом."
          : err.message)
        : "Произошла ошибка при загрузке новостей";
      setError(errorMessage);
      
      // Если это первая страница и есть ошибка, показываем её
      // Если это последующие страницы, просто логируем
      if (pageNum === 1) {
        setNews([]); // Очищаем новости при ошибке первой загрузки
      }
    } finally {
      setLoading(false);
      setIsLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, [selectedChannelId]);

  useEffect(() => {
    loadNewsRef.current = loadNews;
  }, [loadNews]);

  // Первая загрузка и перезагрузка при смене канала
  useEffect(() => {
    setPage(1);
    isLoadingRef.current = false;
    loadNews(1, 0, selectedChannelId);
  }, [selectedChannelId, loadNews]);

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
    if (!newsId) return;
    try {
      const response = await fetch(`/api/news/${newsId}/like`, {
        method: "POST",
        credentials: "same-origin",
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const msg = (data && typeof data.error === "string") ? data.error : "Не удалось поставить лайк";
        alertError(msg);
        return;
      }

      setNews((prev) =>
        prev.map((post) =>
          post.id === newsId
            ? {
                ...post,
                isLiked: data.liked,
                _count: {
                  ...post._count,
                  likes: data.count ?? post._count.likes,
                },
              }
            : post
        )
      );
    } catch (err) {
      console.error("Failed to toggle like:", err);
      alertError(err instanceof Error ? err.message : "Не удалось поставить лайк");
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

  return (
    <MembershipGate
      showBlur={true}
      title="Новости для членов профсоюза"
      description="Будьте в курсе последних новостей и событий. Станьте членом профсоюза для доступа к ленте новостей."
    >
    <div className="pb-8">
      {/* Макет с 2 колонками: центрированная лента + сайдбар */}
      <div className="flex gap-6 justify-center">
        {/* Основная лента новостей - ограниченная ширина как в LinkedIn */}
        <div className="w-full max-w-[680px]">
          <PageHeader
            title="Новости"
            description="Следите за последними новостями профсоюза"
            className="mb-6"
          />

        {error && (
          <Card className="mb-6 border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200" padding="sm">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="font-medium">{error}</p>
                <p className="mt-1 text-sm opacity-90">
                  Попробуйте обновить страницу или повторить попытку позже.
                </p>
              </div>
              <button
                onClick={() => {
                  setError("");
                  loadNews(1);
                }}
                className="flex-shrink-0 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Попробовать снова
              </button>
            </div>
          </Card>
        )}

        {loading && news.length === 0 ? (
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <NewsCardSkeleton key={i} />
            ))}
          </div>
        ) : news.length === 0 ? (
          <EmptyState
            icon={
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                />
              </svg>
            }
            title="Новостей пока нет"
            description="Новые новости появятся здесь"
          />
        ) : (
        <>
          <div className="space-y-6">
            {news.map((post, index) => (
              <NewsCard
                key={post.id}
                post={post}
                onLikeToggle={handleLikeToggle}
                onPollVote={handlePollVote}
                priority={index < 3} // Приоритетная загрузка для первых 3 карточек
              />
            ))}
          </div>

          {/* Триггер для infinite scroll */}
          {hasMore && (
            <div ref={observerTarget} className="flex justify-center py-8">
              {isLoadingMore && <Spinner size="sm" />}
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
            <NewsChannels
              selectedChannelId={selectedChannelId}
              onSelectChannel={setSelectedChannelId}
            />
            <UnionMembers />
          </div>
        </aside>
      </div>
    </div>
    </MembershipGate>
  );
}

export default function NewsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { status } = useMembershipAccess();
  const isDemoMember = session?.user?.id === DEMO_MEMBER_USER_ID;
  const showPPOHeadView = !isDemoMember && isChairmanView(session);

  // Исключённый: редирект на главную, доступ к новостям закрыт
  useEffect(() => {
    if (status === "excluded") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  if (status === "excluded") {
    return null;
  }
  if (showPPOHeadView) return <PPOHeadNewsPage />;
  return <MemberNewsFeed />;
}

