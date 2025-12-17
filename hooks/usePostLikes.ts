import { useState } from "react";

export function usePostLikes(initialLiked: boolean, initialCount: number) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const [likesCount, setLikesCount] = useState(initialCount);

  const handleLike = async (postId: string) => {
    try {
      const response = await fetch(`/api/posts/${postId}/like`, {
        method: "POST",
      });

      const data = await response.json();

      if (response.ok) {
        setIsLiked(data.liked);
        setLikesCount((prev) => (data.liked ? prev + 1 : prev - 1));
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  return {
    isLiked,
    likesCount,
    handleLike,
  };
}

