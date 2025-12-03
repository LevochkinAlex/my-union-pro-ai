"use client";

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
  isLiked: boolean;
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
}

interface PostsListClientProps {
  posts: Post[];
}

// Компонент скелетона для поста
function PostSkeleton() {
  return (
    <div className="flex-none w-[280px] sm:w-[320px] lg:w-[360px]">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm p-4 animate-pulse h-full">
        {/* Заголовок с аватаром */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
          </div>
        </div>
        
        {/* Контент */}
        <div className="space-y-2 mb-3">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/6"></div>
        </div>
        
        {/* Изображение (если есть) */}
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg mb-3"></div>
        
        {/* Действия */}
        <div className="flex items-center gap-4 pt-3 border-t border-gray-200 dark:border-gray-700">
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
          <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
        </div>
      </div>
    </div>
  );
}

export default function PostsListClient({ posts }: PostsListClientProps) {
  const handleUpdate = () => {
    // Перезагружаем страницу для обновления постов
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  // Вычисляем, сколько скелетонов нужно добавить
  const postsToShow = [...posts];
  const skeletonsNeeded = posts.length < 3 ? 3 - posts.length : 0;
  
  // Добавляем скелетоны, если постов меньше 3
  for (let i = 0; i < skeletonsNeeded; i++) {
    postsToShow.push(null as any);
  }

  if (posts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Пока нет постов
        </p>
      </div>
    );
  }

  return (
    <div className="w-full min-w-0 overflow-hidden">
      {/* Горизонтальный скролл */}
      <div 
        className="flex gap-4 pb-4 overflow-x-auto"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {postsToShow.map((post, index) => {
          if (!post) {
            return <PostSkeleton key={`skeleton-${index}`} />;
          }
          
          return (
            <div key={post.id} className="flex-none w-[280px] sm:w-[320px] lg:w-[360px]">
              <PostCard post={post} onUpdate={handleUpdate} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

