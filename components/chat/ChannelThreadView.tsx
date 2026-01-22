'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { X, Send, Reply, MessageCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import clsx from 'clsx';
import { normalizeUserAvatar } from '@/lib/api-helpers';

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

interface ChannelThreadViewProps {
  postId: string;
  messageId: string;
  chatId: string;
  currentUserId: string;
  onClose: () => void;
  onReplyToChannel?: (content: string) => void; // Callback для отправки ответа в канал
}

export default function ChannelThreadView({
  postId,
  messageId,
  chatId,
  currentUserId,
  onClose,
  onReplyToChannel,
}: ChannelThreadViewProps) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [rootPost, setRootPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sendToChannel, setSendToChannel] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadComments();
    loadRootPost();
  }, [postId]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [comments]);

  const loadRootPost = async () => {
    try {
      const response = await fetch(`/api/news/${postId}`);
      if (response.ok) {
        const data = await response.json();
        setRootPost(data.post);
      }
    } catch (err) {
      console.error('Failed to load root post:', err);
    }
  };

  const loadComments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/news/${postId}/comments`);
      if (!response.ok) {
        throw new Error('Не удалось загрузить комментарии');
      }
      const data = await response.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: newComment.trim() }),
      });

      if (!response.ok) throw new Error('Не удалось отправить комментарий');

      const comment = await response.json();
      setComments([comment, ...comments]);
      setNewComment('');

      // Если выбрано "Also send to channel", отправляем в канал
      if (sendToChannel && onReplyToChannel) {
        onReplyToChannel(newComment.trim());
        setSendToChannel(false);
      }
    } catch (err) {
      console.error('Failed to submit comment:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    if (!replyContent.trim() || !session?.user?.id) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/news/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyContent.trim(), parentId }),
      });

      if (!response.ok) throw new Error('Не удалось отправить ответ');

      const reply = await response.json();
      setComments(comments.map(comment => {
        if (comment.id === parentId) {
          return { ...comment, replies: [...comment.replies, reply] };
        }
        return comment;
      }));
      setReplyContent('');
      setReplyingTo(null);

      // Если выбрано "Also send to channel", отправляем в канал
      if (sendToChannel && onReplyToChannel) {
        onReplyToChannel(replyContent.trim());
        setSendToChannel(false);
      }
    } catch (err) {
      console.error('Failed to submit reply:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const getUserDisplayName = (user: Comment['user']): string => {
    const parts = [user.lastName, user.firstName].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : user.email || 'Пользователь';
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    if (days < 7) return `${days} дн назад`;
    return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <div className="h-full bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-500">Загрузка треда...</div>
      </div>
    );
  }

  return (
    <div className="h-full bg-white dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Reply className="w-4 h-4 text-gray-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Тред</h3>
          <span className="text-sm text-gray-500">
            ({comments.length} {comments.length === 1 ? 'ответ' : comments.length < 5 ? 'ответа' : 'ответов'})
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          aria-label="Закрыть тред"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {/* Root post */}
        {rootPost && (
          <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              {rootPost.title}
            </div>
            <div className="text-xs text-blue-700 dark:text-blue-300">
              Оригинальный пост
            </div>
          </div>
        )}

        {/* Comments */}
        {comments.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <MessageCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Нет комментариев</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="space-y-2">
              {/* Root comment */}
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  {comment.user.avatarUrl ? (
                    <img
                      src={normalizeUserAvatar(comment.user).avatarUrl || '/default-avatar.png'}
                      alt={getUserDisplayName(comment.user)}
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-semibold">
                      {getUserDisplayName(comment.user).charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {getUserDisplayName(comment.user)}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 prose prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {comment.content}
                    </ReactMarkdown>
                  </div>
                  <button
                    onClick={() => {
                      setReplyingTo(replyingTo === comment.id ? null : comment.id);
                      setReplyContent('');
                    }}
                    className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Ответить
                  </button>
                </div>
              </div>

              {/* Reply form */}
              {replyingTo === comment.id && (
                <div className="ml-11 space-y-2">
                  <textarea
                    ref={textareaRef}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Напишите ответ..."
                    className="w-full p-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
                    rows={3}
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                      <input
                        type="checkbox"
                        checked={sendToChannel}
                        onChange={(e) => setSendToChannel(e.target.checked)}
                        className="rounded"
                      />
                      <span>Также отправить в канал</span>
                    </label>
                    <div className="flex-1" />
                    <button
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent('');
                        setSendToChannel(false);
                      }}
                      className="px-3 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                      Отмена
                    </button>
                    <button
                      onClick={() => handleSubmitReply(comment.id)}
                      disabled={!replyContent.trim() || submitting}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Отправить
                    </button>
                  </div>
                </div>
              )}

              {/* Replies */}
              {comment.replies.length > 0 && (
                <div className="ml-11 space-y-3 border-l-2 border-gray-200 dark:border-gray-700 pl-4">
                  {comment.replies.map((reply) => (
                    <div key={reply.id} className="flex gap-3">
                      <div className="flex-shrink-0">
                        {reply.user.avatarUrl ? (
                          <img
                            src={normalizeUserAvatar(reply.user).avatarUrl || '/default-avatar.png'}
                            alt={getUserDisplayName(reply.user)}
                            className="w-6 h-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-semibold">
                            {getUserDisplayName(reply.user).charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {getUserDisplayName(reply.user)}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {formatDate(reply.createdAt)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-900 dark:text-gray-100 prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {reply.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
        <form onSubmit={handleSubmitComment} className="space-y-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Напишите ответ..."
            className="w-full p-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
            rows={3}
          />
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={sendToChannel}
                onChange={(e) => setSendToChannel(e.target.checked)}
                className="rounded"
              />
              <span>Также отправить в канал</span>
            </label>
            <div className="flex-1" />
            <button
              type="submit"
              disabled={!newComment.trim() || submitting}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              Отправить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
