"use client";

import { useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import RichTextEditor from "@/components/admin/RichTextEditor";

interface PostCardProps {
  post: any;
  onUpdate: () => void;
}

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [viewCount, setViewCount] = useState(post.viewCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [editPostType, setEditPostType] = useState(post.postType);
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [editFilePreviews, setEditFilePreviews] = useState<string[]>([]);
  const [editLinkUrl, setEditLinkUrl] = useState("");
  const [editVideoUrl, setEditVideoUrl] = useState("");
  const [editLinkMetadata, setEditLinkMetadata] = useState<any>(post.linkMetadata);
  const [editVideoMetadata, setEditVideoMetadata] = useState<any>(post.videoMetadata);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  
  const isOwnPost = session?.user?.id === post.author.id;
  const isArticle = post.postType === "article";
  
  // Для статей извлекаем текст из HTML, для обычных постов используем как есть
  const getPlainText = (html: string) => {
    if (!html) return "";
    // Удаляем HTML теги и декодируем HTML entities
    const text = html
      .replace(/<[^>]*>/g, " ") // Удаляем HTML теги
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, " ") // Заменяем множественные пробелы на один
      .trim();
    return text;
  };
  
  const plainContent = isArticle ? getPlainText(post.content) : post.content;
  const shouldTruncate = plainContent.length > 300;
  const displayContent = shouldTruncate && !isExpanded 
    ? plainContent.substring(0, 300) + "..."
    : plainContent;

  const getUserName = (user: any) => {
    const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
    return parts.join(" ") || "Пользователь";
  };

  const getInitials = (user: any) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.firstName?.[0] || user.lastName?.[0] || "?";
  };

  // Helper function to get file URL (for production compatibility)
  const getFileUrl = (filePath: string) => {
    if (!filePath) return "";
    // If it's already a full URL, return as is
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      return filePath;
    }
    // Extract filename from path
    const filename = filePath.split("/").pop();
    if (!filename) return filePath;
    // Use API endpoint for serving files
    return `/api/uploads/posts/${filename}`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  const handleLike = async () => {
    try {
      const response = await fetch(`/api/posts/${post.id}/like`, {
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

  const loadComments = async () => {
    if (showComments) {
      setShowComments(false);
      return;
    }

    setLoadingComments(true);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`);
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

    setSendingComment(true);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText }),
      });

      const data = await response.json();

      if (response.ok) {
        setCommentText("");
        loadComments();
        onUpdate();
      }
    } catch (error) {
      console.error("Error sending comment:", error);
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      {/* Автор */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {post.author.avatarUrl ? (
            <img
              src={post.author.avatarUrl}
              alt={getUserName(post.author)}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
              {getInitials(post.author)}
            </div>
          )}
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">
              {getUserName(post.author)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatTime(post.createdAt)}
            </p>
          </div>
        </div>
        
        {/* Меню действий (только для своих постов) */}
        {isOwnPost && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="Действия с постом"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
              </svg>
            </button>
            
            {showMenu && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      setShowEditModal(true);
                      setEditContent(post.content);
                      setEditPostType(post.postType);
                      setEditLinkUrl(post.linkMetadata?.url || "");
                      setEditVideoUrl(post.videoMetadata?.embedUrl || "");
                      setEditLinkMetadata(post.linkMetadata || null);
                      setEditVideoMetadata(post.videoMetadata || null);
                      setEditFiles([]);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Редактировать
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm("Вы уверены, что хотите удалить этот пост?")) {
                        setIsDeleting(true);
                        try {
                          const response = await fetch(`/api/posts/${post.id}`, {
                            method: "DELETE",
                          });
                          if (response.ok) {
                            onUpdate();
                          } else {
                            alert("Ошибка при удалении поста");
                          }
                        } catch (error) {
                          console.error("Error deleting post:", error);
                          alert("Ошибка при удалении поста");
                        } finally {
                          setIsDeleting(false);
                          setShowMenu(false);
                        }
                      }
                    }}
                    disabled={isDeleting}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    {isDeleting ? "Удаление..." : "Удалить"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Контент */}
      <div className="mb-4">
        <div className="mb-4">
          <p className="text-gray-900 dark:text-white whitespace-pre-wrap break-words">
            {displayContent}
          </p>
          {shouldTruncate && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {isExpanded ? "Показать меньше" : "Показать больше"}
            </button>
          )}
        </div>

        {/* Вложения */}
        {post.attachments && post.attachments.length > 0 && (
          <div className="space-y-2 mb-4">
            {post.attachments.map((attachment: any) => (
              <div key={attachment.id}>
                {attachment.type === "image" ? (
                  <img
                    src={getFileUrl(attachment.filePath)}
                    alt={attachment.originalName}
                    className="max-w-full rounded-lg object-contain"
                    style={{ maxHeight: '500px' }}
                    onError={(e) => {
                      // Fallback на прямой путь, если API не работает
                      const target = e.target as HTMLImageElement;
                      const fallbackUrl = attachment.filePath.startsWith('http') 
                        ? attachment.filePath 
                        : attachment.filePath.startsWith('/') 
                          ? attachment.filePath 
                          : `/uploads/posts/${attachment.fileName || attachment.filePath.split('/').pop()}`;
                      if (target.src !== fallbackUrl) {
                        target.src = fallbackUrl;
                      }
                    }}
                  />
                ) : (
                  <a
                    href={getFileUrl(attachment.filePath)}
                    download={attachment.originalName}
                    className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {attachment.originalName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(attachment.fileSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Ссылка с превью */}
        {post.linkMetadata && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
            <a href={post.linkMetadata.url} target="_blank" rel="noopener noreferrer" className="block">
              {post.linkMetadata.image && (
                <img
                  src={post.linkMetadata.image}
                  alt={post.linkMetadata.title}
                  className="w-full h-48 object-cover rounded-lg mb-2"
                />
              )}
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {post.linkMetadata.title}
              </h4>
              {post.linkMetadata.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {post.linkMetadata.description}
                </p>
              )}
            </a>
          </div>
        )}

        {/* Видео */}
        {post.videoMetadata && (
          <div className="mb-4">
            <iframe
              src={post.videoMetadata.embedUrl}
              className="w-full h-64 rounded-lg"
              allowFullScreen
            />
          </div>
        )}
      </div>

      {/* Действия */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <div className="flex items-center gap-6">
          <button
            onClick={handleLike}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isLiked
                ? "text-blue-600 bg-blue-50 dark:bg-blue-900/20"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <svg className="w-5 h-5" fill={isLiked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <span>{likesCount}</span>
          </button>
          <button
            onClick={loadComments}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span>{post.commentsCount}</span>
          </button>
          <div className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>{viewCount}</span>
          </div>
          {isArticle && (
            <button
              onClick={() => router.push(`/posts/${post.id}`)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors ml-auto"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
              <span>Развернуть статью</span>
            </button>
          )}
        </div>

        {/* Комментарии */}
        {showComments && (
          <div className="mt-4 space-y-4">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-3">
                {comment.user.avatarUrl ? (
                  <img
                    src={comment.user.avatarUrl}
                    alt={getUserName(comment.user)}
                    className="w-8 h-8 rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold">
                    {getInitials(comment.user)}
                  </div>
                )}
                <div className="flex-1">
                  <p className="font-semibold text-sm text-gray-900 dark:text-white">
                    {getUserName(comment.user)}
                  </p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {comment.content}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formatTime(comment.createdAt)}
                  </p>
                </div>
              </div>
            ))}

            {/* Форма комментария */}
            {session && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendComment();
                    }
                  }}
                  placeholder="Написать комментарий..."
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <button
                  onClick={sendComment}
                  disabled={!commentText.trim() || sendingComment}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Отправить
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно редактирования */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-500/50 dark:bg-gray-900/70 h-screen w-screen" onClick={(e) => {
          if (e.target === e.currentTarget) {
            editFilePreviews.forEach((preview) => {
              if (preview) URL.revokeObjectURL(preview);
            });
            setShowEditModal(false);
            setEditFiles([]);
            setEditFilePreviews([]);
          }
        }}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Заголовок модалки */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Редактировать пост</h2>
              <button
                type="button"
                onClick={() => {
                  // Очищаем превью при закрытии
                  editFilePreviews.forEach((preview) => {
                    if (preview) URL.revokeObjectURL(preview);
                  });
                  setShowEditModal(false);
                  setEditFiles([]);
                  setEditFilePreviews([]);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Контент модалки */}
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!editContent.trim() && editFiles.length === 0 && !editLinkUrl && !editVideoUrl) {
                alert("Пост не может быть пустым");
                return;
              }
              setIsSaving(true);
              try {
                const formData = new FormData();
                formData.append("content", editContent.trim());
                formData.append("postType", editPostType);
                
                if (editLinkMetadata) {
                  formData.append("linkMetadata", JSON.stringify(editLinkMetadata));
                }
                if (editVideoMetadata) {
                  formData.append("videoMetadata", JSON.stringify(editVideoMetadata));
                }

                editFiles.forEach((file) => {
                  formData.append("attachments", file);
                });

                const response = await fetch(`/api/posts/${post.id}`, {
                  method: "PATCH",
                  body: formData,
                });

                if (response.ok) {
                  // Очищаем превью
                  editFilePreviews.forEach((preview) => {
                    if (preview) URL.revokeObjectURL(preview);
                  });
                  setShowEditModal(false);
                  setEditFiles([]);
                  setEditFilePreviews([]);
                  onUpdate();
                } else {
                  const data = await response.json();
                  alert(data.error || "Ошибка при сохранении поста");
                }
              } catch (error) {
                console.error("Error updating post:", error);
                alert("Ошибка при сохранении поста");
              } finally {
                setIsSaving(false);
              }
            }} className="flex-1 overflow-y-auto">
              <div className="p-4 lg:p-6 space-y-4">
                {/* WYSIWYG редактор для статей */}
                {post.postType === "article" ? (
                  <RichTextEditor
                    value={editContent}
                    onChange={setEditContent}
                    placeholder="Начните писать статью..."
                  />
                ) : (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="О чем вы думаете?"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[200px]"
                  />
                )}

                {/* Выбор типа поста */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Фото
                  </button>
                  <button
                    type="button"
                    onClick={() => editFileInputRef.current?.click()}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    Файл
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditFiles([]);
                      setEditVideoUrl("");
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    Ссылка
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditFiles([]);
                      setEditLinkUrl("");
                    }}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Видео
                  </button>
                </div>

                <input
                  type="file"
                  ref={editFileInputRef}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setEditFiles(files);
                    // Создаем превью для изображений
                    const previews = files.map((file) => {
                      if (file.type.startsWith("image/")) {
                        return URL.createObjectURL(file);
                      }
                      return "";
                    });
                    setEditFilePreviews(previews);
                  }}
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.heic,.heif"
                  multiple
                />

                {/* Выбранные файлы */}
                {editFiles.length > 0 && (
                  <div className="space-y-2">
                    {editFiles.map((file, index) => (
                      <div key={index} className="space-y-2">
                        {file.type.startsWith("image/") && editFilePreviews[index] ? (
                          <div className="relative">
                            <img
                              src={editFilePreviews[index]}
                              alt={file.name}
                              className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                URL.revokeObjectURL(editFilePreviews[index]);
                                setEditFiles(editFiles.filter((_, i) => i !== index));
                                setEditFilePreviews(editFilePreviews.filter((_, i) => i !== index));
                              }}
                              className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                            <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                              {file.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (editFilePreviews[index]) {
                                  URL.revokeObjectURL(editFilePreviews[index]);
                                }
                                setEditFiles(editFiles.filter((_, i) => i !== index));
                                setEditFilePreviews(editFilePreviews.filter((_, i) => i !== index));
                              }}
                              className="text-red-500 hover:text-red-700 flex-shrink-0"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Существующие вложения */}
                {post.attachments && post.attachments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Текущие вложения:</p>
                    {post.attachments.map((attachment: any) => (
                      <div key={attachment.id} className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded text-sm">
                        <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                          {attachment.originalName}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Поле для ссылки */}
                {editPostType === "link" && (
                  <input
                    type="url"
                    value={editLinkUrl}
                    onChange={async (e) => {
                      const url = e.target.value;
                      setEditLinkUrl(url);
                      if (url && url.startsWith("http")) {
                        try {
                          const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
                          if (response.ok) {
                            const data = await response.json();
                            setEditLinkMetadata(data);
                          }
                        } catch (error) {
                          console.error("Error fetching link metadata:", error);
                        }
                      } else {
                        setEditLinkMetadata(null);
                      }
                    }}
                    placeholder="Вставьте ссылку"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                )}

                {/* Поле для видео */}
                {editPostType === "video" && (
                  <input
                    type="url"
                    value={editVideoUrl}
                    onChange={async (e) => {
                      const url = e.target.value;
                      setEditVideoUrl(url);
                      if (url) {
                        let provider = "";
                        let videoId = "";
                        let embedUrl = "";

                        if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
                          provider = "youtube";
                          videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || "";
                          embedUrl = `https://www.youtube.com/embed/${videoId}`;
                        } else if (url.includes("rutube.ru/video/")) {
                          provider = "rutube";
                          videoId = url.match(/rutube\.ru\/video\/([^\/\n?#]+)/)?.[1] || "";
                          embedUrl = `https://rutube.ru/play/embed/${videoId}`;
                        } else if (url.includes("vk.com/video")) {
                          provider = "vk";
                          const match = url.match(/vk\.com\/video(-?\d+_\d+)/);
                          if (match) {
                            videoId = match[1];
                            embedUrl = `https://vk.com/video_ext.php?oid=${videoId.split("_")[0]}&id=${videoId.split("_")[1]}`;
                          }
                        }

                        if (embedUrl) {
                          setEditVideoMetadata({ provider, videoId, embedUrl });
                        }
                      } else {
                        setEditVideoMetadata(null);
                      }
                    }}
                    placeholder="Вставьте ссылку на YouTube, Rutube или VK видео"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                )}

                {/* Превью ссылки */}
                {editLinkMetadata && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <a href={editLinkMetadata.url} target="_blank" rel="noopener noreferrer" className="block">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{editLinkMetadata.title}</h4>
                      {editLinkMetadata.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {editLinkMetadata.description}
                        </p>
                      )}
                    </a>
                  </div>
                )}

                {/* Превью видео */}
                {editVideoMetadata && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <iframe
                      src={editVideoMetadata.embedUrl}
                      className="w-full h-64 rounded"
                      allowFullScreen
                    />
                  </div>
                )}
              </div>

              {/* Футер модалки */}
              <div className="flex items-center justify-between p-4 lg:p-6 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    // Очищаем превью при отмене
                    editFilePreviews.forEach((preview) => {
                      if (preview) URL.revokeObjectURL(preview);
                    });
                    setShowEditModal(false);
                    setEditFiles([]);
                    setEditFilePreviews([]);
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={isSaving || (!editContent.trim() && editFiles.length === 0 && !editLinkUrl && !editVideoUrl)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

