import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export function usePostComments(postId: string, session: any) {
  const { showToast } = useToast();
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [isCommentAreaHovered, setIsCommentAreaHovered] = useState(false);
  const [replyToComment, setReplyToComment] = useState<any>(null);
  const [editingComment, setEditingComment] = useState<any>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [commentMenuOpen, setCommentMenuOpen] = useState<string | null>(null);

  const loadComments = async () => {
    if (showComments && !isCommentAreaHovered) {
      setShowComments(false);
      return;
    }

    setLoadingComments(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`);
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
        setShowComments(true);
      }
    } catch (error) {
      console.error("Error loading comments:", error);
    } finally {
      setLoadingComments(false);
    }
  };

  const sendComment = async () => {
    if (!commentText.trim() || sendingComment) return;

    const commentToSend = commentText.trim();
    setSendingComment(true);
    try {
      const response = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentToSend,
          parentId: replyToComment?.id || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setCommentText("");
        setReplyToComment(null);
        const newComment = {
          id: data.comment?.id || `temp-${Date.now()}`,
          content: commentToSend,
          createdAt: new Date().toISOString(),
          parentId: replyToComment?.id || null,
          user: {
            id: session?.user?.id,
            firstName: session?.user?.name?.split(' ')[0] || '',
            lastName: session?.user?.name?.split(' ')[1] || '',
            middleName: '',
            avatarUrl: null,
          },
          replies: [],
        };
        setComments(prev => [newComment, ...prev]);
        
        const refreshResponse = await fetch(`/api/posts/${postId}/comments`);
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setComments(refreshData.comments || []);
        }
      }
    } catch (error) {
      console.error("Error sending comment:", error);
    } finally {
      setSendingComment(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editCommentText.trim()) return;

    try {
      const response = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editCommentText.trim() }),
      });

      if (response.ok) {
        setEditingComment(null);
        setEditCommentText("");
        const refreshResponse = await fetch(`/api/posts/${postId}/comments`);
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setComments(refreshData.comments || []);
        }
      } else {
        const data = await response.json();
        showToast(data.error || "Ошибка при редактировании комментария", "error");
      }
    } catch (error) {
      console.error("Error editing comment:", error);
      showToast("Ошибка при редактировании комментария", "error");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Удалить комментарий?")) return;

    try {
      const response = await fetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        const refreshResponse = await fetch(`/api/posts/${postId}/comments`);
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setComments(refreshData.comments || []);
        }
        showToast("Комментарий удален", "success");
      } else {
        const data = await response.json();
        showToast(data.error || "Ошибка при удалении комментария", "error");
      }
    } catch (error) {
      console.error("Error deleting comment:", error);
      showToast("Ошибка при удалении комментария", "error");
    }
  };

  return {
    showComments,
    setShowComments,
    comments,
    setComments,
    commentText,
    setCommentText,
    loadingComments,
    sendingComment,
    isCommentAreaHovered,
    setIsCommentAreaHovered,
    replyToComment,
    setReplyToComment,
    editingComment,
    setEditingComment,
    editCommentText,
    setEditCommentText,
    commentMenuOpen,
    setCommentMenuOpen,
    loadComments,
    sendComment,
    handleEditComment,
    handleDeleteComment,
  };
}

