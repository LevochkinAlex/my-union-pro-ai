"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Image from "next/image";
import { useToast } from "@/components/ui/Toast";
import { getFileUrlWithCDN } from "@/lib/cdn";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatarUrl: string | null;
  };
  replies: Comment[];
  _count: {
    replies: number;
  };
}

interface NewsCommentsProps {
  newsId: string;
}

export default function NewsComments({ newsId }: NewsCommentsProps) {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | null>(null);

  // Загружаем аватар текущего пользователя
  useEffect(() => {
    if (session?.user?.id) {
      fetch("/api/profile")
        .then((res) => res.json())
        .then((data) => {
          if (data.user?.avatarUrl) {
            setCurrentUserAvatar(data.user.avatarUrl);
          }
        })
        .catch((error) => {
          console.error("[NewsComments] Failed to load user avatar:", error);
        });
    }
  }, [session?.user?.id]);

  useEffect(() => {
    loadComments();
  }, [newsId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/news/${newsId}/comments`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить комментарии");
      }
      const data = await response.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error("Failed to load comments:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !session?.user?.id) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/news/${newsId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: newComment.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить комментарий");
      }

      const comment = await response.json();
      setComments([comment, ...comments]);
      setNewComment("");
    } catch (err) {
      console.error("Failed to submit comment:", err);
      showToast(err instanceof Error ? err.message : "Произошла ошибка", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim() || !session?.user?.id) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/news/${newsId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: replyContent.trim(),
          parentId,
        }),
      });

      if (!response.ok) {
        throw new Error("Не удалось отправить ответ");
      }

      const reply = await response.json();
      setComments(
        comments.map((comment) =>
          comment.id === parentId
            ? { ...comment, replies: [...comment.replies, reply] }
            : comment
        )
      );
      setReplyContent("");
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to submit reply:", err);
      showToast(err instanceof Error ? err.message : "Произошла ошибка", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 60) {
      return `${diffMinutes || 1} мин назад`;
    }
    if (diffHours < 24) {
      return `${diffHours} ч назад`;
    }
    if (diffDays < 7) {
      return `${diffDays} дн назад`;
    }
    return date.toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const userName = (user: Comment["user"]) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    return user.email;
  };

  // Компонент аватара с поддержкой base64 и CDN
  const Avatar = ({ user, size = 8 }: { user: Comment["user"]; size?: number }) => {
    const name = userName(user);
    const sizeClass = size === 8 ? 'h-8 w-8' : 'h-6 w-6';
    
    if (user.avatarUrl) {
      // Проверяем, является ли изображение data URL (base64)
      const isDataUrl = user.avatarUrl.startsWith('data:');
      const isHttpUrl = user.avatarUrl.startsWith('http://') || user.avatarUrl.startsWith('https://');
      
      // Получаем правильный URL
      const avatarSrc = isDataUrl || isHttpUrl 
        ? user.avatarUrl 
        : getFileUrlWithCDN(user.avatarUrl, true);
      
      return (
        <div className={`${sizeClass} rounded-full overflow-hidden flex-shrink-0`}>
          <img
            src={avatarSrc}
            alt={name}
            className="h-full w-full object-cover"
            onError={(e) => {
              // При ошибке загрузки скрываем изображение
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </div>
      );
    }
    
    // Фолбэк - круг с первой буквой
    const textSize = size === 8 ? 'text-sm' : 'text-xs';
    const bgColor = size === 8 
      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
      : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    
    return (
      <div className={`flex ${sizeClass} items-center justify-center rounded-full ${bgColor} ${textSize} font-semibold flex-shrink-0`}>
        {name.charAt(0).toUpperCase()}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
        Загрузка комментариев...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Comment Form */}
      {session?.user?.id ? (
        <form onSubmit={handleSubmitComment} className="mb-6">
          <div className="flex gap-3">
            <Avatar 
              user={{
                id: session.user.id,
                firstName: session.user.firstName || null,
                lastName: session.user.lastName || null,
                email: session.user.email || "",
                avatarUrl: currentUserAvatar,
              }} 
              size={8} 
            />
            <div className="flex-1">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Написать комментарий..."
                rows={3}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                required
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !newComment.trim()}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Отправка..." : "Отправить"}
                </button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
          Войдите, чтобы оставить комментарий
        </div>
      )}

      {/* Comments List */}
      {comments.length === 0 ? (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400">
          Комментариев пока нет. Будьте первым!
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="space-y-3">
              <div className="flex gap-3">
                <Avatar user={comment.user} size={8} />
                <div className="flex-1 min-w-0">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-900">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {userName(comment.user)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {comment.content}
                    </p>
                  </div>
                  <div className="mt-1">
                    {replyingTo === comment.id ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={replyContent}
                          onChange={(e) => setReplyContent(e.target.value)}
                          placeholder="Написать ответ..."
                          rows={2}
                          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={submitting || !replyContent.trim()}
                            className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
                          >
                            Отправить
                          </button>
                          <button
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyContent("");
                            }}
                            className="rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReplyingTo(comment.id)}
                        className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                      >
                        Ответить
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Replies */}
              {comment.replies.length > 0 && (
                <div className="ml-11 space-y-3 border-l-2 border-gray-200 pl-4 dark:border-gray-700">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="flex gap-3">
                      <Avatar user={reply.user} size={6} />
                      <div className="flex-1 min-w-0">
                        <div className="rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="text-xs font-semibold text-gray-900 dark:text-white">
                              {userName(reply.user)}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {formatDate(reply.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {reply.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

