"use client";

import { useEffect, useState } from "react";
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
}

interface PostFeedProps {
  userId?: string;
  limit?: number;
}

export default function PostFeed({ userId, limit }: PostFeedProps) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPosts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, limit]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (userId) params.append("userId", userId);
      if (limit) params.append("limit", limit.toString());
      
      const url = `/api/posts?${params.toString()}`;
      console.log("[PostFeed] Loading posts from:", url);
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        console.log("[PostFeed] Posts loaded:", data.posts?.length || 0);
        setPosts(data.posts || []);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error("[PostFeed] Error loading posts:", response.status, response.statusText, errorData);
        setPosts([]);
      }
    } catch (error) {
      console.error("[PostFeed] Error loading posts:", error);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Загрузка...</div>;
  }

  if (posts.length === 0) {
    return <div className="text-center py-8 text-gray-500">Пока нет постов</div>;
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} onUpdate={loadPosts} />
      ))}
    </div>
  );
}

