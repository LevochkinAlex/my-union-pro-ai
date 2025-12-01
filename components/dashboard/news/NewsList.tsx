"use client";

import NewsCard from "./NewsCard";

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

export default function NewsList({ news }: NewsListProps) {
  const handleLikeToggle = async (newsId: string) => {
    // TODO: Реализовать лайк/дизлайк через API
    console.log("Like toggle for news:", newsId);
  };

  const handlePollVote = async (pollId: string, optionId: string) => {
    // TODO: Реализовать голосование через API
    console.log("Poll vote:", pollId, optionId);
  };

  if (news.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Пока нет новостей
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {news.map((post) => (
        <NewsCard
          key={post.id}
          post={post}
          onLikeToggle={handleLikeToggle}
          onPollVote={handlePollVote}
        />
      ))}
    </div>
  );
}

