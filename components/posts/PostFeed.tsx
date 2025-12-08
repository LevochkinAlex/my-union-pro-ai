"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import PostCard from "./PostCard";

interface Post {
  id: string;
  content: string;
  postType: string;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
    jobTitle: string | null;
    profession: string | null;
    organization: {
      id: string;
      name: string;
    } | null;
  };
  attachments: any[];
  linkMetadata: any;
  videoMetadata: any;
  coverImage?: string;
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
}

interface PostFeedProps {
  userId?: string;
  limit?: number; // Если указан limit, показываем только это количество без infinite scroll
  refreshKey?: number; // Ключ для принудительного обновления
}

const POSTS_PER_PAGE = 10;
const MAX_POSTS_IN_MEMORY = 100; // Максимум постов в памяти для оптимизации
const INTERSECTION_THROTTLE_MS = 500; // Задержка между проверками IntersectionObserver

export default function PostFeed({ userId, limit, refreshKey }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const lastLoadTimeRef = useRef<number>(0);
  const isLoadingRef = useRef<boolean>(false);

  // Функция для загрузки постов с оптимизацией
  const loadPosts = useCallback(async (pageNum: number, append: boolean = false) => {
    // Защита от параллельных запросов
    if (isLoadingRef.current) {
      return;
    }

    try {
      isLoadingRef.current = true;
      
      if (pageNum === 1) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      
      // Если указан limit, используем его без пагинации
      if (limit) {
        params.append("limit", limit.toString());
      } else {
        params.append("limit", POSTS_PER_PAGE.toString());
        params.append("page", pageNum.toString());
      }
      
      const url = `/api/posts?${params.toString()}`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        const newPosts = data.posts || [];
        
        if (append) {
          setPosts(prev => {
            // Объединяем посты и удаляем дубликаты по ID
            const combined = [...prev, ...newPosts];
            const unique = Array.from(
              new Map(combined.map(post => [post.id, post])).values()
            );
            
            // ОПТИМИЗАЦИЯ: Ограничиваем количество постов в памяти
            // Оставляем только последние MAX_POSTS_IN_MEMORY постов
            if (unique.length > MAX_POSTS_IN_MEMORY) {
              return unique.slice(-MAX_POSTS_IN_MEMORY);
            }
            
            return unique;
          });
        } else {
          // При первой загрузке ограничиваем сразу
          setPosts(newPosts.slice(0, MAX_POSTS_IN_MEMORY));
        }
        
        // Проверяем есть ли ещё посты
        if (limit) {
          setHasMore(false); // При фиксированном limit не показываем "загрузить ещё"
        } else {
          setHasMore(newPosts.length >= POSTS_PER_PAGE);
        }
      } else {
        console.error("[PostFeed] Error loading posts:", response.status);
        if (!append) setPosts([]);
        setHasMore(false);
      }
    } catch (error) {
      console.error("[PostFeed] Error loading posts:", error);
      if (!append) setPosts([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
      lastLoadTimeRef.current = Date.now();
    }
  }, [userId, limit]);

  // Первоначальная загрузка и при изменении параметров
  useEffect(() => {
    setPage(1);
    setPosts([]);
    setHasMore(true);
    loadPosts(1, false);
  }, [userId, limit, refreshKey, loadPosts]);

  // Intersection Observer для infinite scroll с throttle
  useEffect(() => {
    // Не используем infinite scroll если указан limit
    if (limit) return;

    // Очищаем предыдущий observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        const now = Date.now();
        const timeSinceLastLoad = now - lastLoadTimeRef.current;
        
        // THROTTLE: Защита от множественных запросов
        // Проверяем что прошло достаточно времени с последней загрузки
        if (
          first.isIntersecting && 
          hasMore && 
          !loading && 
          !loadingMore && 
          !isLoadingRef.current &&
          timeSinceLastLoad >= INTERSECTION_THROTTLE_MS
        ) {
          setPage(prev => prev + 1);
        }
      },
      { 
        threshold: 0.1, 
        rootMargin: "300px" // Предзагрузка за 300px до конца (для плавности)
      }
    );

    observerRef.current = observer;

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [hasMore, loading, loadingMore, limit]);

  // Загрузка при изменении страницы
  useEffect(() => {
    if (page > 1) {
      loadPosts(page, true);
    }
  }, [page, loadPosts]);

  // Функция обновления ленты (вызывается после создания/редактирования поста)
  const handleUpdate = useCallback(() => {
    setPage(1);
    setPosts([]);
    setHasMore(true);
    loadPosts(1, false);
  }, [loadPosts]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-200 dark:bg-gray-700 rounded-lg h-48"></div>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 dark:text-gray-500 mb-2">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
        </div>
        <p className="text-gray-500 dark:text-gray-400">Пока нет постов</p>
      </div>
    );
  }

  // Мемоизируем список постов для оптимизации рендеринга
  const visiblePosts = useMemo(() => {
    // Для оптимизации показываем все посты, но они будут рендериться лениво
    return posts;
  }, [posts]);

  return (
    <div className="space-y-4">
      {visiblePosts.map((post) => (
        <PostCard 
          key={post.id} 
          post={post} 
          onUpdate={handleUpdate}
        />
      ))}
      
      {/* Триггер для infinite scroll */}
      {!limit && hasMore && (
        <div ref={loadMoreRef} className="py-4">
          {loadingMore && (
            <div className="flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )}
        </div>
      )}
      
      {/* Сообщение о конце ленты */}
      {!limit && !hasMore && posts.length > POSTS_PER_PAGE && (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-sm">
          Все посты загружены
        </div>
      )}
      
      {/* Индикатор оптимизации памяти (только в dev) */}
      {process.env.NODE_ENV === 'development' && posts.length >= MAX_POSTS_IN_MEMORY && (
        <div className="text-center py-2 text-xs text-gray-400 dark:text-gray-600">
          Показывается максимум {MAX_POSTS_IN_MEMORY} постов для оптимизации
        </div>
      )}
    </div>
  );
}
