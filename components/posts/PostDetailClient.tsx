"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Session } from "next-auth";

interface PostDetailClientProps {
  post: any;
  session: Session | null;
}

// Компонент для отображения обложки (картинка или видео)
function CoverMedia({ post, getFileUrl }: { post: any; getFileUrl: (path: string) => string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Не рендерим на сервере чтобы избежать hydration mismatch
  if (!mounted) {
    return null;
  }

  // Проверяем видео-обложку
  const videoMeta = post.videoMetadata;
  if (videoMeta) {
    let vm: any = null;
    try {
      vm = typeof videoMeta === 'string' ? JSON.parse(videoMeta) : videoMeta;
    } catch (e) {
      // Ignore parsing errors
    }
    
    if (vm && vm.videoType && vm.videoId) {
      const embedUrl = vm.embedUrl || (
        vm.videoType === "youtube" ? `https://www.youtube.com/embed/${vm.videoId}` :
        vm.videoType === "rutube" ? `https://rutube.ru/play/embed/${vm.videoId}` :
        vm.videoType === "vk" ? `https://vk.com/video_ext.php?oid=${vm.videoId.split("_")[0]}&id=${vm.videoId.split("_")[1]}` : ""
      );
      
      if (embedUrl) {
        return (
          <div className="w-full">
            <div className="relative w-full" style={{ paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
              <iframe
                src={embedUrl}
                className="absolute top-0 left-0 w-full h-full"
                allowFullScreen
                title="Обложка-видео"
              />
            </div>
          </div>
        );
      }
    }
  }
  
  // Проверяем картинку-обложку
  const coverImagePath = post.coverImage;
  if (coverImagePath) {
    const coverImageUrl = getFileUrl(coverImagePath);
    if (coverImageUrl) {
      return (
        <div className="w-full">
          <img
            src={coverImageUrl}
            alt="Обложка статьи"
            className="w-full max-h-[500px] object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
        </div>
      );
    }
  }
  
  return null;
}

export default function PostDetailClient({ post, session }: PostDetailClientProps) {
  const router = useRouter();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount);
  const [viewCount, setViewCount] = useState(post.viewCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  const getUserName = (user: any) => {
    const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
    return parts.join(" ") || "Пользователь";
  };

  const getFileUrl = (filePath: string) => {
    if (!filePath) return "";
    // If it's already a full URL, return as is
    if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
      return filePath;
    }
    // If it's already an API route, return as is
    if (filePath.startsWith("/api/uploads/")) {
      return filePath;
    }
    // If it starts with /uploads/, convert to API route
    if (filePath.startsWith("/uploads/")) {
      // Extract the path after /uploads/
      const pathAfterUploads = filePath.replace(/^\/uploads\//, "");
      // Determine category from path (posts, chat, avatars, etc.)
      const parts = pathAfterUploads.split("/");
      if (parts.length >= 2) {
        const category = parts[0]; // posts, chat, avatars, etc.
        const filename = parts[parts.length - 1];
        return `/api/uploads/${category}/${filename}`;
      }
    }
    // Extract filename from path
    const filename = filePath.split("/").pop();
    if (!filename) return filePath;
    // Use API endpoint for serving files (default to posts)
    return `/api/uploads/posts/${filename}`;
  };

  const handleLike = async () => {
    if (!session) {
      router.push("/auth/signin");
      return;
    }

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
    if (!commentText.trim() || sendingComment || !session) return;

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
        setCommentsCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Error sending comment:", error);
    } finally {
      setSendingComment(false);
    }
  };

  const formatTime = (date: string | Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин. назад`;
    if (hours < 24) return `${hours} ч. назад`;
    if (days < 7) return `${days} дн. назад`;
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  const getInitials = (user: any) => {
    const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
    if (parts.length === 0) return "?";
    return parts
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("");
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20 dark:bg-gray-900">
      <div className="mx-auto max-w-4xl px-4 py-4 pb-20 sm:px-6 sm:py-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-gray-600 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
          Вернуться
        </button>

        {/* Main Content */}
        <div className="overflow-hidden rounded-xl bg-white shadow-lg dark:bg-gray-800">
          {/* Header */}
          <div className="border-b border-gray-200 dark:border-gray-700 p-4 sm:p-6">
            <div className="flex items-start gap-3">
              {post.author.avatarUrl ? (
                <img
                  src={post.author.avatarUrl}
                  alt={getUserName(post.author)}
                  className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {getUserName(post.author).charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {getUserName(post.author)}
                </div>
                {post.author.jobTitle && (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {post.author.jobTitle}
                    {post.author.organization?.name && ` • ${post.author.organization.name}`}
                  </div>
                )}
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {new Date(post.createdAt).toLocaleDateString("ru-RU", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Cover Image or Video */}
          <CoverMedia post={post} getFileUrl={getFileUrl} />

          {/* Content */}
          <div className="p-4 sm:p-6 md:p-8">
            {post.postType === "article" ? (
              <div
                className="article-content prose prose-lg dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: post.content }}
                style={{
                  color: 'inherit',
                }}
              />
            ) : (
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                {post.content}
              </p>
            )}

            {/* Attachments */}
            {post.attachments && post.attachments.length > 0 && (
              <div className="space-y-4 mt-6">
                {post.attachments.map((attachment: any) => (
                  <div key={attachment.id}>
                    {attachment.type === "image" ? (
                      <img
                        src={getFileUrl(attachment.filePath)}
                        alt={attachment.originalName}
                        className="w-full rounded-lg object-contain"
                        style={{ maxHeight: "600px" }}
                      />
                    ) : (
                      <a
                        href={getFileUrl(attachment.filePath)}
                        download={attachment.originalName}
                        className="flex items-center gap-3 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      >
                        <svg className="w-8 h-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">
                            {attachment.originalName}
                          </p>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            {(attachment.fileSize / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Link Preview */}
            {post.linkMetadata && (
              <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <a href={post.linkMetadata.url} target="_blank" rel="noopener noreferrer" className="block">
                  {post.linkMetadata.image && (
                    <img
                      src={post.linkMetadata.image}
                      alt={post.linkMetadata.title}
                      className="w-full h-48 object-cover rounded-lg mb-3"
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

            {/* Video - показываем только если это НЕ обложка (для обычных постов, не статей) */}
            {post.postType !== "article" && post.videoMetadata && post.videoMetadata.embedUrl && (
              <div className="mt-6">
                <div className="relative" style={{ paddingBottom: "56.25%", height: 0, overflow: "hidden" }}>
                  <iframe
                    src={post.videoMetadata.embedUrl}
                    className="absolute top-0 left-0 w-full h-full rounded-lg"
                    allowFullScreen
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Stats */}
          <div className="border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
            <div className="flex items-center gap-6 text-sm">
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
                disabled={loadingComments}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <span>{commentsCount}</span>
              </button>
              <div className="flex items-center gap-2 px-4 py-2 text-gray-600 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <span>{viewCount}</span>
              </div>
            </div>

            {/* Комментарии */}
            {showComments && (
              <div className="mt-6 space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    {comment.user.avatarUrl ? (
                      <img
                        src={comment.user.avatarUrl}
                        alt={getUserName(comment.user)}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                        {getInitials(comment.user)}
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-gray-900 dark:text-white">
                        {getUserName(comment.user)}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
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
                  <div className="flex gap-2 pt-2">
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
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={sendComment}
                      disabled={!commentText.trim() || sendingComment}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {sendingComment ? "Отправка..." : "Отправить"}
                    </button>
                  </div>
                )}
                {!session && (
                  <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                    <button
                      onClick={() => router.push("/auth/signin")}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Войдите
                    </button>
                    {" "}чтобы оставить комментарий
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

