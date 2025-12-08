"use client";

import NewsMiniCard from "./NewsMiniCard";

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

interface NewsListProps {
  news: NewsPost[];
}

// Компонент скелетона для новости
function NewsSkeleton() {
  return (
    <div className="flex-none w-[260px] sm:w-[280px]">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-pulse h-[280px] flex flex-col">
        {/* Обложка */}
        <div className="w-full h-32 bg-gray-200 dark:bg-gray-700"></div>
        
        <div className="p-4 flex flex-col flex-1">
          {/* Автор */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
          </div>
          
          {/* Заголовок */}
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
          
          {/* Контент */}
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-1"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          
          {/* Статистика */}
          <div className="flex items-center gap-4 pt-3 mt-auto border-t border-gray-100 dark:border-gray-700">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10"></div>
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-10"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewsList({ news }: NewsListProps) {
  if (news.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Пока нет новостей
        </p>
      </div>
    );
  }

  // Показываем минимум 3 карточки (с скелетонами если нужно)
  const skeletonsNeeded = news.length < 3 ? 3 - news.length : 0;

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
        {news.map((post) => (
          <div key={post.id} className="flex-none w-[260px] sm:w-[280px]">
            <NewsMiniCard post={post} />
          </div>
        ))}
        
        {/* Скелетоны если новостей мало */}
        {Array.from({ length: skeletonsNeeded }).map((_, index) => (
          <NewsSkeleton key={`skeleton-${index}`} />
        ))}
      </div>
    </div>
  );
}
