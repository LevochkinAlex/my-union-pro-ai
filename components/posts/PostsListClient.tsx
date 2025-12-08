"use client";

import PostMiniCard from "./PostMiniCard";

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
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  viewCount?: number;
  createdAt: string;
  updatedAt: string;
}

interface PostsListClientProps {
  posts: Post[];
}

// Компонент скелетона для поста
function PostSkeleton() {
  return (
    <div className="flex-none w-[260px] sm:w-[280px]">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-pulse h-[180px] flex flex-col">
        {/* Заголовок с аватаром */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0"></div>
          <div className="flex-1 min-w-0">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
        
        {/* Контент */}
        <div className="space-y-2 flex-1">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
        </div>
        
        {/* Статистика */}
        <div className="flex items-center gap-4 pt-3 mt-auto border-t border-gray-100 dark:border-gray-700">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10"></div>
        </div>
      </div>
    </div>
  );
}

export default function PostsListClient({ posts }: PostsListClientProps) {
  if (posts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Пока нет постов
        </p>
      </div>
    );
  }

  // Показываем минимум 3 карточки (с скелетонами если нужно)
  const skeletonsNeeded = posts.length < 3 ? 3 - posts.length : 0;

  return (
    <div className="w-full min-w-0 overflow-hidden">
      {/* Горизонтальный скролл */}
      <div 
        className="flex gap-4 pb-4 overflow-x-auto scrollbar-hide"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {posts.map((post) => (
          <div key={post.id} className="flex-none w-[260px] sm:w-[280px]">
            <PostMiniCard post={post} />
          </div>
        ))}
        
        {/* Скелетоны если постов мало */}
        {Array.from({ length: skeletonsNeeded }).map((_, index) => (
          <PostSkeleton key={`skeleton-${index}`} />
        ))}
      </div>
    </div>
  );
}
