"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { backNavLinkButtonClass } from "@/lib/back-nav-link-button";
import { useSession } from "next-auth/react";
import PostFeed from "@/components/posts/PostFeed";
import CreatePost from "@/components/posts/CreatePost";

export default function UserPostsPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const userId = params.id as string;
  const isOwnProfile = session?.user?.id === userId;

  return (
    <div className="max-w-2xl lg:max-w-3xl mx-auto px-4 py-6">
      {/* Кнопка назад */}
      <button
        type="button"
        onClick={() => router.back()}
        className={`${backNavLinkButtonClass} mb-6 gap-2`}
      >
        <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span>Назад</span>
      </button>
      
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
        {isOwnProfile ? "Мои посты" : "Посты пользователя"}
      </h1>
      
      {isOwnProfile && (
        <div className="mb-6">
          <CreatePost />
        </div>
      )}
      
      <PostFeed userId={userId} />
    </div>
  );
}

