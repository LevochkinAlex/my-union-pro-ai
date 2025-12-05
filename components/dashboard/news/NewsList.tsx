"use client";

import { useState } from "react";
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

export default function NewsList({ news: initialNews }: NewsListProps) {
  const [news, setNews] = useState(initialNews);

  const handleLikeToggle = async (newsId: string) => {
    try {
      const response = await fetch(`/api/news/${newsId}/like`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setNews((prevNews) =>
          prevNews.map((post) =>
            post.id === newsId
              ? {
                  ...post,
                  isLiked: data.liked,
                  _count: {
                    ...post._count,
                    likes: data.liked
                      ? post._count.likes + 1
                      : post._count.likes - 1,
                  },
                }
              : post
          )
        );
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  const handlePollVote = async (pollId: string, optionId: string) => {
    try {
      const response = await fetch(`/api/news/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });

      if (response.ok) {
        const data = await response.json();
        setNews((prevNews) =>
          prevNews.map((post) => ({
            ...post,
            polls: post.polls.map((poll) =>
              poll.id === pollId
                ? {
                    ...poll,
                    options: data.poll.options,
                    totalVotes: data.poll.totalVotes,
                    userVote: optionId,
                  }
                : poll
            ),
          }))
        );
      }
    } catch (error) {
      console.error("Error voting in poll:", error);
    }
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
    <div 
      className="flex gap-6 pb-4 overflow-x-auto"
      style={{ 
        scrollbarWidth: 'thin', 
        msOverflowStyle: 'none',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {news.map((post) => (
        <div key={post.id} className="flex-none w-[320px] sm:w-[380px] lg:w-[400px]">
          <NewsCard
            post={post}
            onLikeToggle={handleLikeToggle}
            onPollVote={handlePollVote}
          />
        </div>
      ))}
    </div>
  );
}

