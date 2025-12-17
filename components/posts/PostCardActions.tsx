"use client";

import { useState } from "react";
import { usePostLikes } from "@/hooks/usePostLikes";

interface PostCardActionsProps {
  post: any;
  viewCount: number;
  onCommentsClick: () => void;
  showComments: boolean;
}

export default function PostCardActions({
  post,
  viewCount,
  onCommentsClick,
  showComments,
}: PostCardActionsProps) {
  const { isLiked, likesCount, handleLike } = usePostLikes(
    post.isLiked,
    post.likesCount
  );

  return (
    <div className="flex items-center gap-6 pt-3 border-t border-gray-200 dark:border-gray-700">
      <button
        onClick={() => handleLike(post.id)}
        className={`flex items-center gap-2 ${
          isLiked
            ? "text-red-600 dark:text-red-400"
            : "text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        } transition-colors`}
      >
        <svg
          className="w-5 h-5"
          fill={isLiked ? "currentColor" : "none"}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
        <span className="text-sm font-medium">{likesCount}</span>
      </button>

      <button
        onClick={onCommentsClick}
        className={`flex items-center gap-2 ${
          showComments
            ? "text-blue-600 dark:text-blue-400"
            : "text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
        } transition-colors`}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        <span className="text-sm font-medium">{post.commentsCount || 0}</span>
      </button>

      {viewCount > 0 && (
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 ml-auto">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
            />
          </svg>
          <span className="text-sm">{viewCount}</span>
        </div>
      )}
    </div>
  );
}

