"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { MessageCircle, Send, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { normalizeUserAvatar } from "@/lib/api-helpers";

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

interface ChannelCommentsProps {
  postId: string;
  isOwn: boolean;
  initialCount?: number;
  onOpenThread?: () => void; // Callback для открытия треда в двухколоночном layout
}

export default function ChannelComments({ postId, isOwn, initialCount = 0, onOpenThread }: ChannelCommentsProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentsCount, setCommentsCount] = useState(initialCount);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const replyFormRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isExpanded) {
      loadComments();
    }
  }, [isExpanded, postId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/news/${postId}/comments`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить комментарии");
      }
      const data = await response.json();
      setComments(data.comments || []);
      setCommentsCount(data.pagination?.total || comments.length);
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
      const response = await fetch(`/api/news/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (!response.ok) throw new Error("Не удалось отправить комментарий");

      const comment = await response.json();
      setComments([comment, ...comments]);
      setCommentsCount(prev => prev + 1);
      setNewComment("");
    } catch (err) {
      console.error("Failed to submit comment:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim() || !session?.user?.id) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/news/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyContent.trim(), parentId }),
      });

      if (!response.ok) throw new Error("Не удалось отправить ответ");

      const reply = await response.json();
      setComments(comments.map(comment => {
        if (comment.id === parentId) {
          return { ...comment, replies: [...comment.replies, reply] };
        }
        return comment;
      }));
      setCommentsCount(prev => prev + 1);
      setReplyContent("");
      setReplyingTo(null);
    } catch (err) {
      console.error("Failed to submit reply:", err);
    } finally {
      setSubmitting(false);
    }
  };

  // Получаем уникальных участников треда (для мини-аватарок)
  const getThreadParticipants = (comment: Comment): Array<{ id: string; avatarUrl: string | null }> => {
    const participants = new Map<string, { id: string; avatarUrl: string | null }>();
    
    // Добавляем автора комментария
    const normalized = normalizeUserAvatar(comment.user);
    participants.set(comment.user.id, {
      id: comment.user.id,
      avatarUrl: normalized.avatarUrl,
    });

    // Добавляем авторов ответов
    comment.replies.forEach(reply => {
      const normalizedReply = normalizeUserAvatar(reply.user);
      if (!participants.has(reply.user.id)) {
        participants.set(reply.user.id, {
          id: reply.user.id,
          avatarUrl: normalizedReply.avatarUrl,
        });
      }
    });

    return Array.from(participants.values()).slice(0, 5); // Максимум 5 аватарок
  };

  const getUserDisplayName = (user: Comment['user']): string => {
    const parts = [user.lastName, user.firstName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : user.email || "Пользователь";
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} дн назад`;
    return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };

  if (!isExpanded) {
    // Показываем мини-аватарки участников треда и количество ответов
    const allParticipants = new Map<string, { id: string; avatarUrl: string | null }>();
    comments.forEach(comment => {
      const normalized = normalizeUserAvatar(comment.user);
      if (!allParticipants.has(comment.user.id)) {
        allParticipants.set(comment.user.id, {
          id: comment.user.id,
          avatarUrl: normalized.avatarUrl,
        });
      }
      comment.replies.forEach(reply => {
        const normalizedReply = normalizeUserAvatar(reply.user);
        if (!allParticipants.has(reply.user.id)) {
          allParticipants.set(reply.user.id, {
            id: reply.user.id,
            avatarUrl: normalizedReply.avatarUrl,
          });
        }
      });
    });
    const participants = Array.from(allParticipants.values()).slice(0, 5);
    const totalReplies = comments.reduce((sum, c) => sum + (c.replies.length || c._count.replies || 0), 0);

    return (
      <button
        onClick={() => {
          if (onOpenThread) {
            onOpenThread();
          } else {
            setIsExpanded(true);
          }
        }}
        className={clsx(
          "flex items-center gap-2 text-xs transition-colors group",
          isOwn ? 'text-white/70 hover:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
        )}
      >
        {participants.length > 0 && (
          <div className="flex -space-x-1.5">
            {participants.slice(0, 3).map((participant, idx) => (
              <img
                key={participant.id}
                src={participant.avatarUrl || "/default-avatar.png"}
                alt=""
                className="w-4 h-4 rounded-full border border-white dark:border-gray-900"
                style={{ zIndex: 10 - idx }}
              />
            ))}
            {participants.length > 3 && (
              <div className={clsx(
                "w-4 h-4 rounded-full border border-white dark:border-gray-900 flex items-center justify-center text-[9px] font-medium",
                isOwn 
                  ? 'bg-white/20 text-white' 
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              )}>
                +{participants.length - 3}
              </div>
            )}
          </div>
        )}
        <MessageCircle className="w-3.5 h-3.5" />
        <span>
          {totalReplies > 0 ? `${totalReplies} ${totalReplies === 1 ? 'ответ' : totalReplies < 5 ? 'ответа' : 'ответов'}` : commentsCount}
        </span>
      </button>
    );
  }

  return (
    <div className={clsx(
      "mt-3 space-y-3",
      isOwn ? 'border-t border-white/20 pt-3' : 'border-t border-gray-200 dark:border-gray-700 pt-3'
    )}>
      {/* Заголовок с кнопкой свернуть */}
      <div className="flex items-center justify-between">
        <h4 className={clsx(
          "text-sm font-semibold",
          isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
        )}>
          Комментарии ({commentsCount})
        </h4>
        <button
          onClick={() => setIsExpanded(false)}
          className={clsx(
            "p-1 rounded hover:bg-opacity-10 transition-colors",
            isOwn ? 'text-white/70 hover:text-white hover:bg-white/10' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          )}
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>

      {/* Форма нового комментария */}
      {session?.user?.id && (
        <form onSubmit={handleSubmitComment} className="space-y-2">
          <div className="flex gap-2">
            <textarea
              ref={commentTextareaRef}
              value={newComment}
              onChange={(e) => {
                setNewComment(e.target.value);
                if (commentTextareaRef.current) {
                  commentTextareaRef.current.style.height = 'auto';
                  commentTextareaRef.current.style.height = Math.min(commentTextareaRef.current.scrollHeight, 100) + 'px';
                }
              }}
              placeholder="Написать комментарий..."
              className={clsx(
                "flex-1 px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-blue-500",
                isOwn 
                  ? 'bg-white/10 border-white/20 text-white placeholder-white/50' 
                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400'
              )}
              rows={1}
              disabled={submitting}
            />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className={clsx(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                isOwn
                  ? 'bg-white/20 text-white hover:bg-white/30'
                  : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {/* Список комментариев */}
      {loading ? (
        <div className={clsx(
          "text-sm text-center py-4",
          isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
        )}>
          Загрузка...
        </div>
      ) : comments.length === 0 ? (
        <div className={clsx(
          "text-sm text-center py-4",
          isOwn ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'
        )}>
          Пока нет комментариев
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const participants = getThreadParticipants(comment);
            const hasReplies = comment.replies.length > 0 || comment._count.replies > 0;
            const totalReplies = comment.replies.length || comment._count.replies || 0;

            return (
              <div key={comment.id} className="space-y-2">
                {/* Основной комментарий */}
                <div className="flex gap-3">
                  <img
                    src={normalizeUserAvatar(comment.user).avatarUrl || "/default-avatar.png"}
                    alt={getUserDisplayName(comment.user)}
                    className="w-8 h-8 rounded-full flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={clsx(
                      "rounded-lg px-3 py-2",
                      isOwn 
                        ? 'bg-white/10' 
                        : 'bg-gray-100 dark:bg-gray-800'
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={clsx(
                          "text-sm font-medium",
                          isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
                        )}>
                          {getUserDisplayName(comment.user)}
                        </span>
                        <span className={clsx(
                          "text-xs",
                          isOwn ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'
                        )}>
                          {formatDate(comment.createdAt)}
                        </span>
                      </div>
                      <p className={clsx(
                        "text-sm whitespace-pre-wrap break-words",
                        isOwn ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'
                      )}>
                        {comment.content}
                      </p>
                    </div>

                    {/* Кнопка ответа и мини-аватарки участников треда */}
                    <div className="flex items-center gap-3 mt-1 ml-11">
                      <button
                        onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
                        className={clsx(
                          "text-xs font-medium transition-colors",
                          isOwn 
                            ? 'text-white/70 hover:text-white' 
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                        )}
                      >
                        Ответить
                      </button>
                      {hasReplies && (
                        <div className="flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {participants.slice(0, 3).map((participant, idx) => (
                              <img
                                key={participant.id}
                                src={participant.avatarUrl || "/default-avatar.png"}
                                alt=""
                                className="w-5 h-5 rounded-full border-2 border-white dark:border-gray-900"
                                style={{ zIndex: 10 - idx }}
                              />
                            ))}
                            {participants.length > 3 && (
                              <div className={clsx(
                                "w-5 h-5 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center text-[10px] font-medium",
                                isOwn 
                                  ? 'bg-white/20 text-white' 
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                              )}>
                                +{participants.length - 3}
                              </div>
                            )}
                          </div>
                          <span className={clsx(
                            "text-xs",
                            isOwn ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'
                          )}>
                            {totalReplies} {totalReplies === 1 ? 'ответ' : totalReplies < 5 ? 'ответа' : 'ответов'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Форма ответа */}
                    {replyingTo === comment.id && (
                      <div ref={replyFormRef} className="mt-2 ml-11 space-y-2">
                        <div className="flex gap-2">
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Написать ответ..."
                            className={clsx(
                              "flex-1 px-3 py-2 text-sm rounded-lg border resize-none focus:outline-none focus:ring-2 focus:ring-blue-500",
                              isOwn 
                                ? 'bg-white/10 border-white/20 text-white placeholder-white/50' 
                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400'
                            )}
                            rows={1}
                            disabled={submitting}
                          />
                          <button
                            onClick={() => handleSubmitReply(comment.id)}
                            disabled={!replyContent.trim() || submitting}
                            className={clsx(
                              "px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                              isOwn
                                ? 'bg-white/20 text-white hover:bg-white/30'
                                : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                            )}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Ответы */}
                    {comment.replies.length > 0 && (
                      <div className="mt-2 ml-11 space-y-2">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="flex gap-2">
                            <img
                              src={normalizeUserAvatar(reply.user).avatarUrl || "/default-avatar.png"}
                              alt={getUserDisplayName(reply.user)}
                              className="w-6 h-6 rounded-full flex-shrink-0"
                            />
                            <div className={clsx(
                              "flex-1 rounded-lg px-3 py-2",
                              isOwn 
                                ? 'bg-white/5' 
                                : 'bg-gray-50 dark:bg-gray-800/50'
                            )}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className={clsx(
                                  "text-sm font-medium",
                                  isOwn ? 'text-white' : 'text-gray-900 dark:text-white'
                                )}>
                                  {getUserDisplayName(reply.user)}
                                </span>
                                <span className={clsx(
                                  "text-xs",
                                  isOwn ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'
                                )}>
                                  {formatDate(reply.createdAt)}
                                </span>
                              </div>
                              <p className={clsx(
                                "text-sm whitespace-pre-wrap break-words",
                                isOwn ? 'text-white/90' : 'text-gray-700 dark:text-gray-300'
                              )}>
                                {reply.content}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
