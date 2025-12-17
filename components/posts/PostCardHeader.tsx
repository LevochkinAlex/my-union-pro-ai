"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getUserName, getInitials, formatTime } from "@/lib/posts/postUtils";

interface PostCardHeaderProps {
  post: any;
  isOwnPost: boolean;
  showMenu: boolean;
  onMenuToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

export default function PostCardHeader({
  post,
  isOwnPost,
  showMenu,
  onMenuToggle,
  onDelete,
  onEdit,
}: PostCardHeaderProps) {
  const userName = getUserName(post.author);
  const initials = getInitials(post.author);

  return (
    <div className="flex items-start justify-between mb-3">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Link
          href={`/dashboard/profile/${post.author.id}`}
          className="flex-shrink-0"
        >
          {post.author.avatarUrl ? (
            <div className="relative w-10 h-10 rounded-full overflow-hidden">
              <Image
                src={post.author.avatarUrl}
                alt={userName}
                width={40}
                height={40}
                className="object-cover"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
              {initials}
            </div>
          )}
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            href={`/dashboard/profile/${post.author.id}`}
            className="font-semibold text-gray-900 dark:text-white hover:underline block truncate"
          >
            {userName}
          </Link>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {formatTime(post.createdAt)}
          </span>
        </div>
      </div>

      {isOwnPost && (
        <div className="relative">
          <button
            onClick={onMenuToggle}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <svg
              className="w-5 h-5 text-gray-500 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
              />
            </svg>
          </button>

          {showMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-10">
              <button
                onClick={onEdit}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
              >
                Редактировать
              </button>
              <button
                onClick={onDelete}
                className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
              >
                Удалить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

