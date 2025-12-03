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
  }, [userId, limit]);

  const loadPosts = async () => {
    try {
      setLoading(true);
      const url = userId ? `/api/posts?userId=${userId}${limit ? `&limit=${limit}` : ""}` : `/api/posts${limit ? `?limit=${limit}` : ""}`;
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setPosts(data.posts || []);
      } else {
        console.error("Error loading posts:", response.status, response.statusText);
        setPosts([]);
      }
    } catch (error) {
      console.error("Error loading posts:", error);
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

