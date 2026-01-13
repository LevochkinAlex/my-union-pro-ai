"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import RichTextEditor from "@/components/admin/RichTextEditor";
import ImageInsertModal from "@/components/posts/ImageInsertModal";
import { useToast } from "@/components/ui/Toast";
import LinkPreviewCard from "./LinkPreviewCard";
import VideoEmbed from "./VideoEmbed";

interface PostCardProps {
  post: any;
  onUpdate: () => void;
}

// Хелпер для формирования URL превью изображения с поддержкой CDN
const getPreviewUrl = (imageUrl: string): string => {
  if (!imageUrl) return "";
  
  // Если это data URL, возвращаем как есть
  if (imageUrl.startsWith("data:")) {
    return imageUrl;
  }
  
  // Используем утилиту для работы с CDN
  const { getFileUrlWithCDN } = require("@/lib/cdn");
  return getFileUrlWithCDN(imageUrl, true);
};

export default function PostCard({ post, onUpdate }: PostCardProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast } = useToast();
  const [isLiked, setIsLiked] = useState(post.isLiked);
  const [likesCount, setLikesCount] = useState(post.likesCount);
  const [viewCount, setViewCount] = useState(post.viewCount || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);
  const [isCommentAreaHovered, setIsCommentAreaHovered] = useState(false);
  const [replyToComment, setReplyToComment] = useState<any>(null);
  const [showAllCommentsModal, setShowAllCommentsModal] = useState(false);
  const [editingComment, setEditingComment] = useState<any>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const [commentMenuOpen, setCommentMenuOpen] = useState<string | null>(null);
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
  const [coverImage, setCoverImage] = useState<string | null>((post as any).coverImage || null);
  const [editCoverImage, setEditCoverImage] = useState<string | null>((post as any).coverImage || null);
  const [isEditImageModalOpen, setIsEditImageModalOpen] = useState(false);
  const [isEditVideoModalOpen, setIsEditVideoModalOpen] = useState(false);
  const [imageInsertMode, setImageInsertMode] = useState<"content" | "cover">("content");
  const [isVideoModalForCover, setIsVideoModalForCover] = useState(false);
  const [deletedAttachmentIds, setDeletedAttachmentIds] = useState<string[]>([]);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const editArticleEditorRef = useRef<HTMLDivElement>(null);
  const commentAreaTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const postCardRef = useRef<HTMLDivElement>(null);
  const hasIncrementedView = useRef(false);
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | null>(null);
  
  const isOwnPost = session?.user?.id === post.author.id;
  const isArticle = post.postType === "article";

  // Отслеживание видимости поста для инкремента просмотров
  useEffect(() => {
    if (!postCardRef.current || hasIncrementedView.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // Когда пост становится видимым (более 50% в видимой области)
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !hasIncrementedView.current) {
            hasIncrementedView.current = true;
            
            // Увеличиваем счётчик просмотров
            fetch(`/api/posts/${post.id}/view`, {
              method: "POST",
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.viewCount !== undefined) {
                  setViewCount(data.viewCount);
                }
              })
              .catch((err) => {
                console.error("Failed to increment view count:", err);
              });
          }
        });
      },
      {
        threshold: 0.5, // 50% видимости
        rootMargin: "0px",
      }
    );

    observer.observe(postCardRef.current);

    return () => {
      if (postCardRef.current) {
        observer.unobserve(postCardRef.current);
      }
    };
  }, [post.id]);

  // Синхронизируем coverImage с пропсами post
  useEffect(() => {
    if ((post as any).coverImage !== undefined) {
      setCoverImage((post as any).coverImage || null);
      setEditCoverImage((post as any).coverImage || null);
    }
  }, [(post as any).coverImage]);

  // Загружаем avatarUrl текущего пользователя из профиля
  useEffect(() => {
    if (session?.user?.id) {
      fetch("/api/profile")
        .then((res) => res.ok ? res.json() : null)
        .then((data) => {
          if (data?.user?.avatarUrl) {
            setCurrentUserAvatarUrl(data.user.avatarUrl);
          }
        })
        .catch(() => {});
    }
  }, [session?.user?.id]);

  // Автоматическая адаптация высоты textarea
  const autoResizeTextarea = (textarea: HTMLTextAreaElement | null) => {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  // Обновляем высоту при изменении текста комментария
  useEffect(() => {
    autoResizeTextarea(commentTextareaRef.current);
  }, [commentText]);
  
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

  // Helper function to get file URL with CDN support
  const getFileUrl = (filePath: string, defaultCategory: string = "posts") => {
    if (!filePath) return "";
    
    const trimmedPath = filePath.trim();
    
    // Validate: reject obviously invalid paths (single characters like "Z" that aren't URLs)
    // Reject paths shorter than 3 characters unless they start with / or http or data:
    if (trimmedPath.length < 3) {
      if (!trimmedPath.startsWith("/") && !trimmedPath.startsWith("http") && !trimmedPath.startsWith("data:")) {
        return "";
      }
    }
    
    // If it's a data URL (base64), return as is
    if (trimmedPath.startsWith("data:")) {
      return trimmedPath;
    }
    
    // Используем утилиту для работы с CDN
    const { getFileUrlByCategory, getFileUrlWithCDN } = require("@/lib/cdn");
    
    // If it's already a full URL, use CDN utility for normalization
    if (trimmedPath.startsWith("http://") || trimmedPath.startsWith("https://")) {
      return getFileUrlWithCDN(trimmedPath, true);
    }
    
    // Определяем категорию из пути
    let category = defaultCategory;
    if (trimmedPath.includes("/avatars/") || trimmedPath.includes("avatars-")) {
      category = "avatars";
    } else if (trimmedPath.includes("/chat/") || trimmedPath.includes("chat-")) {
      category = "chat";
    } else if (trimmedPath.includes("/posts/") || trimmedPath.includes("posts-")) {
      category = "posts";
    } else if (trimmedPath.includes("/documents/") || trimmedPath.includes("documents-")) {
      category = "documents";
    } else if (trimmedPath.includes("/knowledge/") || trimmedPath.includes("knowledge-")) {
      category = "knowledge";
    }
    
    // Если путь начинается с /uploads/, извлекаем имя файла
    if (trimmedPath.startsWith("/uploads/")) {
      const pathAfterUploads = trimmedPath.replace(/^\/uploads\//, "");
      const parts = pathAfterUploads.split("/").filter(p => p.length > 0);
      
      if (parts.length >= 2) {
        // Path has category and filename
        category = parts[0];
        const filename = parts[parts.length - 1];
        if (!filename || (filename.length < 3 && !filename.includes("."))) return "";
        return getFileUrlByCategory(category as any, filename, true);
      } else if (parts.length === 1) {
        // Path has only filename
        const filename = parts[0];
        if (!filename || (filename.length < 3 && !filename.includes("."))) return "";
        return getFileUrlByCategory(category as any, filename, true);
      }
      return "";
    }
    
    // For other paths, validate and extract filename
    if (trimmedPath.length < 3) {
      return "";
    }
    if (!trimmedPath.includes(".") && !trimmedPath.startsWith("/") && !trimmedPath.startsWith("http") && !trimmedPath.startsWith("data:")) {
      return "";
    }
    
    const filename = trimmedPath.split("/").pop();
    if (!filename || (filename.length < 3 && !filename.includes("."))) return "";
    
    return getFileUrlByCategory(category as any, filename, true);
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
      // Если комментарии уже открыты и мышь не в области комментариев, закрываем
      if (!isCommentAreaHovered) {
      setShowComments(false);
      return;
      }
      // Если мышь в области, просто обновляем комментарии
    }

    setLoadingComments(true);
    try {
      const response = await fetch(`/api/posts/${post.id}/comments`);
      if (response.ok) {
        const data = await response.json();
        console.log("Comments loaded:", data.comments);
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
      const response = await fetch(`/api/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: commentToSend,
          parentId: replyToComment?.id || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Очищаем поле ввода, но оставляем форму открытой
        setCommentText("");
        setReplyToComment(null);
        // Обновляем комментарии, добавляя новый в начало списка оптимистично
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
        // Обновляем счетчик комментариев локально
        // Перезагружаем комментарии для получения актуальных данных (без закрытия)
        const refreshResponse = await fetch(`/api/posts/${post.id}/comments`);
        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          setComments(refreshData.comments || []);
        }
        // НЕ вызываем onUpdate() чтобы не перезагружать весь список постов
      }
    } catch (error) {
      console.error("Error sending comment:", error);
    } finally {
      setSendingComment(false);
    }
  };

  // Функция для редактирования комментария
  const handleEditComment = async (commentId: string) => {
    if (!editCommentText.trim()) return;

    try {
      const response = await fetch(`/api/posts/${post.id}/comments/${commentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editCommentText.trim() }),
      });

      if (response.ok) {
        setEditingComment(null);
        setEditCommentText("");
        // Перезагружаем комментарии
        const refreshResponse = await fetch(`/api/posts/${post.id}/comments`);
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

  // Функция для удаления комментария
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm("Удалить комментарий?")) return;

    try {
      const response = await fetch(`/api/posts/${post.id}/comments/${commentId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Перезагружаем комментарии
        const refreshResponse = await fetch(`/api/posts/${post.id}/comments`);
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

  // Обработчики для вставки изображений и видео при редактировании
  const handleEditImageUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const response = await fetch("/api/posts/upload-image", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok && data.url) {
        const imageUrl = data.url;
        console.log('[PostCard] Image uploaded, API returned URL:', imageUrl);
        // Конвертируем URL для превью через хелпер
        const previewUrl = getPreviewUrl(imageUrl);
        console.log('[PostCard] Preview URL:', previewUrl);
        
        if (imageInsertMode === "cover") {
          // Используем как обложку - очищаем видео, если было
          setEditVideoMetadata(null);
          setEditVideoUrl("");
          setEditCoverImage(previewUrl);
          console.log('[PostCard] Set editCoverImage to:', previewUrl);
          setIsEditImageModalOpen(false);
          setImageInsertMode("content");
          showToast("✓ Обложка загружена", "success");
        } else {
          // Вставляем в контент
          if (editArticleEditorRef.current) {
            const editor = editArticleEditorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
            if (editor && (editor as any).insertImage) {
              (editor as any).insertImage(previewUrl, file.name);
            }
          }
        }
        setIsEditImageModalOpen(false);
        setImageInsertMode("content"); // Сбрасываем режим
      } else {
        const errorMessage = data.error || "Ошибка при загрузке изображения";
        console.error("[PostCard] Upload error:", errorMessage, data);
        showToast(errorMessage, "error");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при загрузке изображения";
      showToast(errorMessage, "error");
    }
  };

  const handleEditImageGenerate = async (imageUrl: string) => {
    console.log("[PostCard] handleEditImageGenerate called with:", imageUrl);
    // Конвертируем URL для превью через хелпер
    const fullImageUrl = getPreviewUrl(imageUrl);
    console.log("[PostCard] Preview URL:", fullImageUrl);
    
    if (imageInsertMode === "cover") {
      // Используем как обложку - очищаем видео, если было
      setEditVideoMetadata(null);
      setEditVideoUrl("");
      setEditCoverImage(fullImageUrl);
      setIsEditImageModalOpen(false);
      setImageInsertMode("content");
      showToast("✓ Обложка сгенерирована", "success");
    } else {
      // Вставляем в контент - только img тег без wrapper и кнопки
      if (editArticleEditorRef.current) {
        const editor = editArticleEditorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
        console.log("[PostCard] Found editor:", !!editor, "Has insertImage:", !!(editor as any)?.insertImage);
        
        if (editor && (editor as any).insertImage) {
          // Фокусируемся на редакторе перед вставкой
          editor.focus();
          (editor as any).insertImage(fullImageUrl, "Сгенерированное изображение");
          console.log("[PostCard] Image inserted successfully");
        } else {
          // Fallback: добавляем только img тег без wrapper и кнопки
          console.log("[PostCard] Using fallback - updating editContent directly");
          const imgHtml = `<img src="${fullImageUrl}" alt="Сгенерированное изображение" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />`;
          setEditContent(prev => prev + imgHtml);
        }
      }
    }
    setIsEditImageModalOpen(false);
    setImageInsertMode("content"); // Сбрасываем режим
  };

  const handleEditVideoInsert = (url: string) => {
    let embedUrl = "";
    let videoType = "";
    let videoId = "";
    
    if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
      videoType = "youtube";
      videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || "";
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (url.includes("rutube.ru/video/")) {
      videoType = "rutube";
      videoId = url.match(/rutube\.ru\/video\/([^\/\n?#]+)/)?.[1] || "";
      embedUrl = `https://rutube.ru/play/embed/${videoId}`;
    } else if (url.includes("vk.com/video")) {
      videoType = "vk";
      const match = url.match(/vk\.com\/video(-?\d+_\d+)/);
      if (match) {
        videoId = match[1];
        embedUrl = `https://vk.com/video_ext.php?oid=${videoId.split("_")[0]}&id=${videoId.split("_")[1]}`;
      }
    } else if (url.match(/\.(mp4|webm|ogg|mov)(\?|$)/i)) {
      // Прямые ссылки на видео файлы (mp4, webm и т.д.)
      videoType = "direct";
      videoId = url.split("/").pop()?.split("?")[0] || "video";
      embedUrl = url;
    }

    if (!embedUrl) {
      showToast("Неподдерживаемый формат видео. Используйте YouTube, Rutube, VK или прямую ссылку на видео", "error");
      return;
    }

    // Если видео вставляется как обложка
    if (isVideoModalForCover) {
      // Очищаем coverImage, если был установлен
      setEditCoverImage(null);
      // Устанавливаем videoMetadata как обложку
      setEditVideoMetadata({
        videoType,
        videoId,
        embedUrl,
        url,
      });
      setIsEditVideoModalOpen(false);
      setIsVideoModalForCover(false);
      showToast("✓ Видео-обложка добавлена", "success");
      return;
    }

    // Для статей вставляем iframe в редактор
    if (editArticleEditorRef.current) {
      const editor = editArticleEditorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
      if (editor) {
        const wrapper = document.createElement('div');
        wrapper.style.position = 'relative';
        wrapper.style.paddingBottom = '56.25%';
        wrapper.style.height = '0';
        wrapper.style.overflow = 'hidden';
        wrapper.style.maxWidth = '100%';
        wrapper.style.margin = '16px 0';
        wrapper.style.borderRadius = '8px';
        
        const iframe = document.createElement('iframe');
        iframe.src = embedUrl;
        iframe.style.position = 'absolute';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.frameBorder = '0';
        iframe.allowFullscreen = true;
        
        wrapper.appendChild(iframe);
        
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.insertNode(wrapper);
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        } else {
          editor.appendChild(wrapper);
        }
        
        const event = new Event('input', { bubbles: true });
        editor.dispatchEvent(event);
      }
      setIsEditVideoModalOpen(false);
      showToast("✓ Видео вставлено в статью", "success");
    }
  };

  return (
    <div ref={postCardRef} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 max-w-[680px] mx-auto">
      {/* Автор */}
      <div className="flex items-center justify-between mb-4">
        <Link href={`/dashboard/profile/${post.author.id}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="relative w-10 h-10">
            {(() => {
              const avatarUrl = post.author.avatarUrl;
              const fileUrl = avatarUrl ? getFileUrl(avatarUrl, "avatars") : "";
              return fileUrl ? (
                <img
                  src={fileUrl}
              alt={getUserName(post.author)}
              className="w-10 h-10 rounded-full object-cover cursor-pointer"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    const placeholder = e.currentTarget.nextElementSibling;
                    if (placeholder) {
                      (placeholder as HTMLElement).style.display = 'flex';
                    }
                  }}
                />
              ) : null;
            })()}
            <div 
              className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold cursor-pointer ${(() => {
                const avatarUrl = post.author.avatarUrl;
                const fileUrl = avatarUrl ? getFileUrl(avatarUrl, "avatars") : "";
                return fileUrl ? 'hidden' : '';
              })()}`}
            >
              {getInitials(post.author)}
            </div>
          </div>
          <div>
            <p className="font-semibold text-gray-900 dark:text-white cursor-pointer">
              {getUserName(post.author)}
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {formatTime(post.createdAt)}
            </p>
          </div>
        </Link>
        
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
                      // Берём картинку из coverImage или из первого image attachment
                      const existingImage = (post as any).coverImage || 
                        post.attachments?.find((a: any) => a.type === "image")?.filePath || null;
                      setEditCoverImage(existingImage);
                      setEditFiles([]);
                      setEditFilePreviews([]);
                      setDeletedAttachmentIds([]);
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
                            showToast("Ошибка при удалении поста", "error");
                          }
                        } catch (error) {
                          console.error("Error deleting post:", error);
                          showToast("Ошибка при удалении поста", "error");
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
        {/* Обложка для статей (картинка или видео) */}
        {isArticle && (() => {
          // Проверяем видео-обложку
          const videoMeta = post.videoMetadata;
          if (videoMeta) {
            let vm: any = null;
            try {
              vm = typeof videoMeta === 'string' ? JSON.parse(videoMeta) : videoMeta;
            } catch (e) {
              console.error("Error parsing videoMetadata:", e);
            }
            
            if (vm && vm.videoType && vm.videoId) {
              return (
                <div className="mb-4">
                  <VideoEmbed
                    videoType={vm.videoType}
                    videoId={vm.videoId}
                    title={vm.title || "Обложка"}
                  />
                </div>
              );
            }
          }
          
          // Проверяем картинку-обложку
          const coverImagePath = coverImage || (post as any).coverImage;
          if (coverImagePath) {
            const coverImageUrl = getFileUrl(coverImagePath, "posts");
            if (coverImageUrl) {
              return (
                <div className="mb-4">
                  <img
                    src={coverImageUrl}
                    alt="Обложка"
                    className="w-full h-fit object-cover rounded-lg"
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
        })()}
        
        {/* Cover Image для обычных постов (не статей) */}
        {!isArticle && (() => {
          const coverImagePath = coverImage || (post as any).coverImage;
          if (!coverImagePath) return null;
          const coverImageUrl = getFileUrl(coverImagePath, "posts");
          if (!coverImageUrl) return null;
          return (
            <div className="mb-4">
              <img
                src={coverImageUrl}
                alt="Обложка"
                className="w-full h-auto object-cover rounded-lg"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          );
        })()}
        
        {/* Текст поста */}
        <div className="mb-4">
          {isArticle ? (
            // Для статей всегда показываем plain текст (без HTML)
            <>
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap break-words">
                {displayContent}
              </p>
              {/* Ссылка на полную статью под текстом */}
              <Link
                href={`/posts/${post.id}`}
                className="inline-flex items-center gap-1.5 mt-3 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Читать полностью</span>
              </Link>
            </>
          ) : (
            <p className="text-gray-900 dark:text-white whitespace-pre-wrap break-words">
              {displayContent}
          </p>
        )}
          {!isArticle && shouldTruncate && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {isExpanded ? "Показать меньше" : "Показать больше"}
            </button>
          )}
        </div>

        {/* Документы (не изображения) - картинка показывается через coverImage */}
        {post.attachments && post.attachments.filter((a: any) => a.type !== "image").length > 0 && (
          <div className="space-y-2 mb-4">
            {post.attachments
              .filter((attachment: any) => attachment.type !== "image")
              .map((attachment: any) => (
              <div key={attachment.id}>
                <a
                  href={getFileUrl(attachment.filePath)}
                    download={attachment.originalName}
                    className="flex items-center gap-2 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {attachment.originalName}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(attachment.fileSize / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </a>
              </div>
            ))}
          </div>
        )}

        {/* Превью видео - показываем только если это НЕ статья (для статей видео уже показано как обложка) */}
        {!isArticle && post.videoMetadata && post.videoMetadata.videoType && post.videoMetadata.videoId && (
          <div className="mb-4">
            <VideoEmbed
              videoType={post.videoMetadata.videoType}
              videoId={post.videoMetadata.videoId}
              title={post.videoMetadata.title}
            />
          </div>
        )}

        {/* Превью ссылки */}
        {post.linkMetadata && !post.videoMetadata && (
          <div className="mb-4">
            <LinkPreviewCard
              url={post.linkMetadata.url}
              title={post.linkMetadata.title}
              description={post.linkMetadata.description}
              image={post.linkMetadata.image}
              siteName={post.linkMetadata.siteName}
              favicon={post.linkMetadata.favicon}
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
        </div>

        {/* Комментарии */}
        {showComments && (
          <div 
            className="mt-4 space-y-4"
            onMouseEnter={() => {
              setIsCommentAreaHovered(true);
              if (commentAreaTimeoutRef.current) {
                clearTimeout(commentAreaTimeoutRef.current);
                commentAreaTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              setIsCommentAreaHovered(false);
              if (!commentText.trim()) {
                commentAreaTimeoutRef.current = setTimeout(() => {
                  if (!isCommentAreaHovered) {
                    setShowComments(false);
                  }
                }, 500);
              }
            }}
          >
            {/* Форма комментария - ВСЕГДА СВЕРХУ */}
            {session && (
              <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
                {replyToComment && (
                  <div className="flex items-center justify-between px-3 py-2 mb-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Ответ для <strong>{getUserName(replyToComment.user)}</strong>
                    </span>
                    <button
                      onClick={() => setReplyToComment(null)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex gap-3">
                  {/* Аватар текущего пользователя */}
                  <div className="flex-shrink-0">
                    {currentUserAvatarUrl ? (
                      <img
                        src={getFileUrl(currentUserAvatarUrl, "avatars")}
                        alt="Аватар"
                        className="w-10 h-10 rounded-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                        {session.user?.name?.charAt(0).toUpperCase() || session.user?.email?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <textarea
                      ref={commentTextareaRef}
                      value={commentText}
                      onChange={(e) => {
                        setCommentText(e.target.value);
                        autoResizeTextarea(e.target);
                      }}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendComment();
                        }
                      }}
                      placeholder={replyToComment ? "Написать ответ..." : "Написать комментарий..."}
                      rows={1}
                      style={{ minHeight: '44px', maxHeight: '200px' }}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={sendComment}
                        disabled={!commentText.trim() || sendingComment}
                        className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                      >
                        {sendingComment ? "Отправка..." : "Отправить"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Список комментариев - показываем только 5 */}
            {comments.filter(c => !c.parentId).slice(0, 5).map((comment) => (
              <div key={comment.id} className="space-y-2">
                <div className="flex gap-3">
                  <Link href={`/dashboard/profile/${comment.user.id}`} className="relative w-8 h-8 hover:opacity-80 transition-opacity flex-shrink-0">
                    {comment.user.avatarUrl && getFileUrl(comment.user.avatarUrl, "avatars") ? (
                      <img
                        src={getFileUrl(comment.user.avatarUrl, "avatars")}
                        alt={getUserName(comment.user)}
                        className="w-8 h-8 rounded-full object-cover cursor-pointer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const placeholder = e.currentTarget.nextElementSibling;
                          if (placeholder) (placeholder as HTMLElement).style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div 
                      className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold cursor-pointer ${comment.user.avatarUrl && getFileUrl(comment.user.avatarUrl, "avatars") ? 'hidden' : ''}`}
                    >
                      {getInitials(comment.user)}
                    </div>
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/profile/${comment.user.id}`} className="font-semibold text-sm text-gray-900 dark:text-white hover:underline cursor-pointer">
                        {getUserName(comment.user)}
                      </Link>
                      {session?.user?.id === comment.user.id && (
                        <div className="relative">
                          <button
                            onClick={() => setCommentMenuOpen(commentMenuOpen === comment.id ? null : comment.id)}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                              <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                            </svg>
                          </button>
                          {commentMenuOpen === comment.id && (
                            <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10 min-w-[120px]">
                              <button
                                onClick={() => {
                                  setEditingComment(comment);
                                  setEditCommentText(comment.content);
                                  setCommentMenuOpen(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                              >
                                Редактировать
                              </button>
                              <button
                                onClick={() => {
                                  setCommentMenuOpen(null);
                                  handleDeleteComment(comment.id);
                                }}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
                              >
                                Удалить
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {editingComment?.id === comment.id ? (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={editCommentText}
                          onChange={(e) => setEditCommentText(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditComment(comment.id)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Сохранить
                          </button>
                          <button
                            onClick={() => { setEditingComment(null); setEditCommentText(""); }}
                            className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{comment.content}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatTime(comment.createdAt)}</p>
                          <button
                            onClick={() => setReplyToComment(comment)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Ответить
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {/* Вложенные ответы */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="ml-11 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                    {comment.replies.map((reply: any) => (
                      <div key={reply.id} className="flex gap-3">
                        <Link href={`/dashboard/profile/${reply.user.id}`} className="relative w-6 h-6 hover:opacity-80 transition-opacity flex-shrink-0">
                          {(() => {
                            const avatarUrl = reply.user.avatarUrl;
                            const fileUrl = avatarUrl ? getFileUrl(avatarUrl, "avatars") : "";
                            return fileUrl ? (
                              <img
                                src={fileUrl}
                                alt={getUserName(reply.user)}
                                className="w-6 h-6 rounded-full object-cover cursor-pointer"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                  const placeholder = e.currentTarget.nextElementSibling;
                                  if (placeholder) (placeholder as HTMLElement).style.display = 'flex';
                                }}
                              />
                            ) : null;
                          })()}
                          <div 
                            className={`w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold cursor-pointer ${(() => {
                              const avatarUrl = reply.user.avatarUrl;
                              const fileUrl = avatarUrl ? getFileUrl(avatarUrl, "avatars") : "";
                              return fileUrl ? 'hidden' : '';
                            })()}`}
                          >
                            {getInitials(reply.user)}
                          </div>
                        </Link>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <Link href={`/dashboard/profile/${reply.user.id}`} className="font-semibold text-xs text-gray-900 dark:text-white hover:underline cursor-pointer">
                              {getUserName(reply.user)}
                            </Link>
                            {session?.user?.id === reply.user.id && (
                              <button
                                onClick={() => handleDeleteComment(reply.id)}
                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                title="Удалить"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{reply.content}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatTime(reply.createdAt)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Кнопка "Показать все" если больше 5 комментариев */}
            {comments.filter(c => !c.parentId).length > 5 && (
              <button
                onClick={() => setShowAllCommentsModal(true)}
                className="w-full rounded-lg border border-gray-300 bg-gray-100 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              >
                Показать все комментарии ({comments.filter(c => !c.parentId).length})
              </button>
            )}
          </div>
        )}
      </div>

      {/* Модальное окно со всеми комментариями */}
      {showAllCommentsModal && (
        <div 
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowAllCommentsModal(false)}
        >
          <div className="w-full max-w-2xl max-h-[90vh] sm:max-h-[80vh] bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col overflow-hidden">
            {/* Заголовок */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Комментарии ({comments.filter(c => !c.parentId).length})
              </h3>
              <button
                onClick={() => setShowAllCommentsModal(false)}
                className="p-2 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Форма ввода в модалке */}
            {session && (
              <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                {replyToComment && (
                  <div className="flex items-center justify-between px-3 py-2 mb-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Ответ для <strong>{getUserName(replyToComment.user)}</strong>
                    </span>
                    <button
                      onClick={() => setReplyToComment(null)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex gap-3">
                  {/* Аватар текущего пользователя */}
                  <div className="flex-shrink-0">
                    {currentUserAvatarUrl ? (
                      <img
                        src={getFileUrl(currentUserAvatarUrl, "avatars")}
                        alt="Аватар"
                        className="w-10 h-10 rounded-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-sm font-semibold">
                        {session.user?.name?.charAt(0).toUpperCase() || session.user?.email?.charAt(0).toUpperCase() || "?"}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={commentText}
                      onChange={(e) => {
                        setCommentText(e.target.value);
                        autoResizeTextarea(e.target);
                      }}
                      onKeyPress={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendComment();
                        }
                      }}
                      placeholder={replyToComment ? "Написать ответ..." : "Написать комментарий..."}
                      rows={1}
                      style={{ minHeight: '44px', maxHeight: '200px' }}
                      className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none overflow-hidden"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={sendComment}
                        disabled={!commentText.trim() || sendingComment}
                        className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                      >
                        {sendingComment ? "Отправка..." : "Отправить"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Скроллируемый список комментариев */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {comments.filter(c => !c.parentId).map((comment) => (
                <div key={comment.id} className="space-y-2">
                  <div className="flex gap-3">
                    <Link href={`/dashboard/profile/${comment.user.id}`} className="relative w-8 h-8 hover:opacity-80 transition-opacity flex-shrink-0">
                      {comment.user.avatarUrl && getFileUrl(comment.user.avatarUrl, "avatars") ? (
                        <img
                          src={getFileUrl(comment.user.avatarUrl, "avatars")}
                          alt={getUserName(comment.user)}
                          className="w-8 h-8 rounded-full object-cover cursor-pointer"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                            const placeholder = e.currentTarget.nextElementSibling;
                            if (placeholder) (placeholder as HTMLElement).style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div 
                        className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-semibold cursor-pointer ${comment.user.avatarUrl && getFileUrl(comment.user.avatarUrl, "avatars") ? 'hidden' : ''}`}
                      >
                        {getInitials(comment.user)}
                      </div>
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Link href={`/dashboard/profile/${comment.user.id}`} className="font-semibold text-sm text-gray-900 dark:text-white hover:underline cursor-pointer">
                          {getUserName(comment.user)}
                        </Link>
                        {session?.user?.id === comment.user.id && (
                          <div className="relative">
                            <button
                              onClick={() => setCommentMenuOpen(commentMenuOpen === comment.id ? null : comment.id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/>
                              </svg>
                            </button>
                            {commentMenuOpen === comment.id && (
                              <div className="absolute right-0 mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-10 min-w-[120px]">
                                <button
                                  onClick={() => {
                                    setEditingComment(comment);
                                    setEditCommentText(comment.content);
                                    setCommentMenuOpen(null);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                  Редактировать
                                </button>
                                <button
                                  onClick={() => {
                                    setCommentMenuOpen(null);
                                    handleDeleteComment(comment.id);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 text-red-600 dark:text-red-400"
                                >
                                  Удалить
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {editingComment?.id === comment.id ? (
                        <div className="mt-2 space-y-2">
                          <input
                            type="text"
                            value={editCommentText}
                            onChange={(e) => setEditCommentText(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditComment(comment.id)}
                              className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                            >
                              Сохранить
                            </button>
                            <button
                              onClick={() => { setEditingComment(null); setEditCommentText(""); }}
                              className="px-3 py-1 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded text-sm hover:bg-gray-300 dark:hover:bg-gray-500"
                            >
                              Отмена
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{comment.content}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <p className="text-xs text-gray-500 dark:text-gray-400">{formatTime(comment.createdAt)}</p>
                            <button
                              onClick={() => setReplyToComment(comment)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              Ответить
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Вложенные ответы */}
                  {comment.replies && comment.replies.length > 0 && (
                    <div className="ml-11 space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                      {comment.replies.map((reply: any) => (
                        <div key={reply.id} className="flex gap-3">
                          <Link href={`/dashboard/profile/${reply.user.id}`} className="relative w-6 h-6 hover:opacity-80 transition-opacity flex-shrink-0">
                            {(() => {
                              const avatarUrl = reply.user.avatarUrl;
                              const fileUrl = avatarUrl ? getFileUrl(avatarUrl, "avatars") : "";
                              return fileUrl ? (
                                <img
                                  src={fileUrl}
                                  alt={getUserName(reply.user)}
                                  className="w-6 h-6 rounded-full object-cover cursor-pointer"
                                  onError={(e) => {
                                    e.currentTarget.style.display = 'none';
                                    const placeholder = e.currentTarget.nextElementSibling;
                                    if (placeholder) (placeholder as HTMLElement).style.display = 'flex';
                                  }}
                                />
                              ) : null;
                            })()}
                            <div 
                              className={`w-6 h-6 rounded-full bg-gradient-to-br from-green-500 to-blue-600 flex items-center justify-center text-white text-xs font-semibold cursor-pointer ${(() => {
                                const avatarUrl = reply.user.avatarUrl;
                                const fileUrl = avatarUrl ? getFileUrl(avatarUrl, "avatars") : "";
                                return fileUrl ? 'hidden' : '';
                              })()}`}
                            >
                              {getInitials(reply.user)}
                            </div>
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/dashboard/profile/${reply.user.id}`} className="font-semibold text-xs text-gray-900 dark:text-white hover:underline cursor-pointer">
                                {getUserName(reply.user)}
                              </Link>
                              {session?.user?.id === reply.user.id && (
                                <button
                                  onClick={() => handleDeleteComment(reply.id)}
                                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                  title="Удалить"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              )}
                            </div>
                            <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{reply.content}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{formatTime(reply.createdAt)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
                showToast("Пост не может быть пустым", "warning");
                return;
              }
              setIsSaving(true);
              try {
                const formData = new FormData();
                
                // Очищаем контент от артефактов перед отправкой
                let cleanedContent = editContent.trim();
                if (editPostType === "article") {
                  // Создаём временный DOM для правильной очистки
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = cleanedContent;
                  
                  // Удаляем все кнопки удаления изображений
                  const deleteButtons = tempDiv.querySelectorAll('.image-delete-btn');
                  deleteButtons.forEach(btn => btn.remove());
                  
                  // Разворачиваем image-wrapper, оставляя только img
                  const wrappers = tempDiv.querySelectorAll('.image-wrapper');
                  wrappers.forEach(wrapper => {
                    const img = wrapper.querySelector('img');
                    if (img && wrapper.parentNode) {
                      wrapper.parentNode.insertBefore(img, wrapper);
                      wrapper.remove();
                    }
                  });
                  
                  // Удаляем сломанные img теги (без src или с невалидным src)
                  const images = tempDiv.querySelectorAll('img');
                  images.forEach(img => {
                    const src = img.getAttribute('src') || '';
                    if (!src || src.trim() === '' || src.startsWith('generated-') || 
                        (!src.startsWith('/') && !src.startsWith('http') && !src.startsWith('data:'))) {
                      img.remove();
                    }
                  });
                  
                  // Удаляем пустые параграфы
                  const paragraphs = tempDiv.querySelectorAll('p');
                  paragraphs.forEach(p => {
                    const text = p.textContent?.trim() || '';
                    if (!text || text === 'generated-' || /^generated-\d+-\w+\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(text)) {
                      p.remove();
                    }
                  });
                  
                  // Удаляем пустые div'ы
                  const divs = tempDiv.querySelectorAll('div');
                  divs.forEach(div => {
                    if (!div.textContent?.trim() && div.children.length === 0) {
                      div.remove();
                    }
                  });
                  
                  cleanedContent = tempDiv.innerHTML.trim();
                  
                  // Финальная очистка текстовых артефактов
                  cleanedContent = cleanedContent.replace(/generated-\d+-\w+\.(jpg|jpeg|png|gif|webp|heic|heif)/gi, '');
                  cleanedContent = cleanedContent.replace(/\s+/g, ' ').trim();
                }
                
                formData.append("content", cleanedContent);
                formData.append("postType", editPostType);
                
                // Сохраняем cover image для всех типов постов
                if (editCoverImage) {
                  // Нормализуем путь перед отправкой
                  // Если это полный URL, извлекаем относительный путь
                  const coverImagePath = editCoverImage.startsWith('http') 
                    ? editCoverImage.replace(window.location.origin, '')
                    : editCoverImage;
                  console.log('[PostCard] Sending coverImage:', { 
                    original: editCoverImage, 
                    normalized: coverImagePath 
                  });
                  formData.append("coverImage", coverImagePath);
                } else {
                  // Если cover image удален, отправляем пустую строку
                  console.log('[PostCard] Removing coverImage (sending empty string)');
                  formData.append("coverImage", "");
                }
                
                if (editLinkMetadata) {
                  formData.append("linkMetadata", JSON.stringify(editLinkMetadata));
                }
                if (editVideoMetadata) {
                  formData.append("videoMetadata", JSON.stringify(editVideoMetadata));
                }

                editFiles.forEach((file) => {
                  formData.append("attachments", file);
                });

                // Отправляем список удаленных вложений
                if (deletedAttachmentIds.length > 0) {
                  formData.append("deletedAttachmentIds", JSON.stringify(deletedAttachmentIds));
                }

                const response = await fetch(`/api/posts/${post.id}`, {
                  method: "PATCH",
                  body: formData,
                });

                if (response.ok) {
                  const data = await response.json();
                  console.log('[PostCard] Post saved successfully, API response:', data.post);
                  // Обновляем coverImage из ответа
                  if (data.post?.coverImage !== undefined) {
                    console.log('[PostCard] Updating coverImage from API response:', data.post.coverImage);
                    setCoverImage(data.post.coverImage);
                    setEditCoverImage(data.post.coverImage);
                  }
                  // Очищаем превью
                  editFilePreviews.forEach((preview) => {
                    if (preview) URL.revokeObjectURL(preview);
                  });
                  setShowEditModal(false);
                  setEditFiles([]);
                  setEditFilePreviews([]);
                  setDeletedAttachmentIds([]);
                  onUpdate();
                } else {
                  const data = await response.json();
                  showToast(data.error || "Ошибка при сохранении поста", "error");
                }
              } catch (error) {
                console.error("Error updating post:", error);
                showToast("Ошибка при сохранении поста", "error");
              } finally {
                setIsSaving(false);
              }
            }} className="flex-1 overflow-y-auto">
              <div className="p-4 lg:p-6 space-y-4">
                {/* WYSIWYG редактор для статей */}
                {post.postType === "article" ? (
                  <>
                    {/* Обложка (картинка ИЛИ видео) */}
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Обложка статьи:
                      </label>
                      {!editCoverImage && !editVideoMetadata ? (
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                            Добавьте обложку (одну картинку или видео)
                          </p>
                          <div className="flex gap-3 justify-center">
                            <button
                              type="button"
                              onClick={() => {
                                setImageInsertMode("cover");
                                setIsEditImageModalOpen(true);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              Картинка
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsVideoModalForCover(true);
                                setIsEditVideoModalOpen(true);
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Видео
                            </button>
                          </div>
                        </div>
                      ) : null}
                      
                      {/* Превью обложки-картинки */}
                      {editCoverImage && (
                        <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <img
                            src={editCoverImage}
                            alt="Обложка"
                            className="w-full h-48 object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditCoverImage(null);
                              setEditVideoMetadata(null);
                            }}
                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg z-10"
                            title="Удалить обложку"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded-full">
                            ✓ Обложка-картинка
                          </div>
                        </div>
                      )}

                      {/* Превью обложки-видео */}
                      {editVideoMetadata && editVideoMetadata.videoType && editVideoMetadata.videoId && (
                        <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                          <VideoEmbed
                            videoType={editVideoMetadata.videoType}
                            videoId={editVideoMetadata.videoId}
                            title="Обложка-видео"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setEditCoverImage(null);
                              setEditVideoMetadata(null);
                            }}
                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg z-10"
                            title="Удалить обложку"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                          <div className="absolute bottom-2 left-2 px-3 py-1 bg-black/50 backdrop-blur-sm text-white text-xs rounded-full">
                            ✓ Обложка-видео
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div ref={editArticleEditorRef}>
                      <RichTextEditor
                        value={editContent}
                        onChange={setEditContent}
                        placeholder="Начните писать статью..."
                        onInsertImage={() => {
                          // Сохраняем позицию курсора перед открытием модалки
                          if (editArticleEditorRef.current) {
                            const editor = editArticleEditorRef.current.querySelector('[contenteditable="true"]') as any;
                            if (editor?.saveSelection) {
                              editor.saveSelection();
                            }
                          }
                          setImageInsertMode("content");
                          setIsEditImageModalOpen(true);
                        }}
                        onInsertVideo={() => {
                          // Сохраняем позицию курсора перед открытием модалки
                          if (editArticleEditorRef.current) {
                            const editor = editArticleEditorRef.current.querySelector('[contenteditable="true"]') as any;
                            if (editor?.saveSelection) {
                              editor.saveSelection();
                            }
                          }
                          setIsEditVideoModalOpen(true);
                        }}
                      />
                    </div>
                    
                    {/* Показываем существующие изображения из HTML с возможностью удаления */}
                    {(() => {
                      const parser = new DOMParser();
                      const doc = parser.parseFromString(editContent, 'text/html');
                      const images = doc.querySelectorAll('img');
                      if (images.length === 0) return null;
                      
                      return (
                        <div className="mt-4 space-y-3">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Изображения в статье:
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            {Array.from(images).map((img, index) => {
                              const src = img.getAttribute('src') || '';
                              const alt = img.getAttribute('alt') || `Изображение ${index + 1}`;
                              const isBroken = !src || src.startsWith('generated-') || (!src.startsWith('/') && !src.startsWith('http') && !src.startsWith('data:'));
                              
                              return (
                                <div key={index} className="relative">
                                  <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                    {isBroken ? (
                                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-2">
                                        <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs text-center break-all">{alt || 'Сломанное изображение'}</span>
                                      </div>
                                    ) : (
                                      <img
                                        src={src}
                                        alt={alt}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.style.display = 'none';
                                          if (target.nextElementSibling) {
                                            (target.nextElementSibling as HTMLElement).style.display = 'flex';
                                          }
                                        }}
                                      />
                                    )}
                                    {/* Кнопка удаления - всегда видима */}
                                    <button
                                      type="button"
                                      onClick={() => {
                                        // Удаляем изображение из HTML
                                        const tempDiv = document.createElement('div');
                                        tempDiv.innerHTML = editContent;
                                        const tempImages = tempDiv.querySelectorAll('img');
                                        if (tempImages[index]) {
                                          const imgSrc = tempImages[index].getAttribute('src') || '';
                                          tempImages[index].remove();
                                          
                                          // Очищаем артефакты - удаляем текст "generated-*.jpg" если он остался
                                          let cleanedContent = tempDiv.innerHTML;
                                          
                                          // Удаляем текст с именем файла, если он остался (в любом месте)
                                          if (imgSrc.includes('generated-')) {
                                            const fileName = imgSrc.split('/').pop() || '';
                                            // Удаляем имя файла в любом контексте
                                            cleanedContent = cleanedContent.replace(new RegExp(fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
                                            // Также удаляем общий паттерн generated-*.jpg
                                            cleanedContent = cleanedContent.replace(/generated-\d+-\w+\.(jpg|jpeg|png|gif|webp|heic|heif)/gi, '');
                                          }
                                          
                                          // Удаляем параграфы с именами файлов
                                          cleanedContent = cleanedContent.replace(/<p[^>]*>\s*generated-\d+-\w+\.(jpg|jpeg|png|gif|webp|heic|heif)\s*<\/p>/gi, '');
                                          cleanedContent = cleanedContent.replace(/<p[^>]*>\s*<\/p>/gi, '');
                                          
                                          // Удаляем лишние пробелы
                                          cleanedContent = cleanedContent.replace(/\n\s*\n/g, '\n');
                                          cleanedContent = cleanedContent.replace(/\s+/g, ' ').trim();
                                          
                                          setEditContent(cleanedContent);
                                        }
                                      }}
                                      className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
                                      title="Удалить изображение"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                  {isBroken && (
                                    <p className="text-xs text-red-500 mt-1">⚠️ Сломанный путь - удалите это изображение</p>
                                  )}
    </div>
  );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="О чем вы думаете?"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[200px]"
                  />
                )}

                {/* Для статей не показываем кнопки добавления файлов - изображения вставляются через редактор */}
                {post.postType !== "article" && (
                  <>
                    {/* Существующая картинка (если нет нового файла) */}
                    {editCoverImage && editFiles.length === 0 && (
                      <div className="relative">
                        <img
                          src={editCoverImage.startsWith('http') ? editCoverImage : 
                               editCoverImage.startsWith('/') ? editCoverImage :
                               `/uploads/posts/${editCoverImage.split('/').pop()}`}
                          alt="Текущее фото"
                          className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                          onError={(e) => {
                            const target = e.target as HTMLImageElement;
                            target.style.display = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditCoverImage(null);
                            // Помечаем ВСЕ существующие вложения на удаление
                            if (post.attachments && post.attachments.length > 0) {
                              setDeletedAttachmentIds(post.attachments.map((a: any) => a.id));
                            }
                          }}
                          className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                          title="Удалить фото"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Кнопка добавления/замены фото */}
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => editFileInputRef.current?.click()}
                        className="px-3 py-2 rounded-lg text-sm font-medium transition-colors bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        {editCoverImage || editFiles.length > 0 ? "Заменить фото" : "Добавить фото"}
                      </button>
                    </div>

                    <input
                      type="file"
                      ref={editFileInputRef}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        
                        // Очищаем предыдущие превью
                        editFilePreviews.forEach((preview) => {
                          if (preview) URL.revokeObjectURL(preview);
                        });
                        
                        // Новый файл заменяет старый (только 1 файл разрешён)
                        setEditFiles([file]);
                        setEditCoverImage(null); // Убираем старую картинку
                        
                        // Помечаем ВСЕ существующие вложения на удаление
                        if (post.attachments && post.attachments.length > 0) {
                          setDeletedAttachmentIds(post.attachments.map((a: any) => a.id));
                        }
                        
                        // Создаем превью для изображения
                        if (file.type.startsWith("image/") || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
                          const preview = URL.createObjectURL(file);
                          setEditFilePreviews([preview]);
                        } else {
                          setEditFilePreviews([""]);
                        }
                      }}
                      className="hidden"
                      accept="image/*,.heic,.heif"
                    />

                    {/* Новый выбранный файл */}
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
                  </>
                )}

                {/* Существующие вложения - показываем для всех типов постов */}
                {post.attachments && post.attachments.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Текущие вложения:</p>
                    {post.attachments
                      .filter((attachment: any) => !deletedAttachmentIds.includes(attachment.id))
                      .map((attachment: any) => {
                        const fileUrl = getFileUrl(attachment.filePath);
                        const isImage = attachment.type === "image";
                        
                        return (
                          <div key={attachment.id} className="relative group border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            {isImage ? (
                              <div className="relative">
                                <img
                                  src={fileUrl}
                                  alt={attachment.originalName}
                                  className="w-full max-h-64 object-contain bg-gray-50 dark:bg-gray-800"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                                {/* Кнопки всегда видимые */}
                                <div className="absolute top-2 right-2 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Заменяем изображение
                                      const input = document.createElement('input');
                                      input.type = 'file';
                                      input.accept = 'image/*,.heic,.heif';
                                      input.onchange = async (e) => {
                                        const file = (e.target as HTMLInputElement).files?.[0];
                                        if (!file) return;
                                        
                                        // Помечаем ВСЕ существующие вложения на удаление
                                        if (post.attachments && post.attachments.length > 0) {
                                          setDeletedAttachmentIds(post.attachments.map((a: any) => a.id));
                                        }
                                        
                                        // Очищаем старые превью
                                        editFilePreviews.forEach((preview) => {
                                          if (preview) URL.revokeObjectURL(preview);
                                        });
                                        
                                        // Устанавливаем новый файл (заменяет все)
                                        setEditFiles([file]);
                                        
                                        // Создаем превью
                                        const preview = URL.createObjectURL(file);
                                        setEditFilePreviews([preview]);
                                      };
                                      input.click();
                                    }}
                                    className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 shadow-lg"
                                    title="Заменить изображение"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      // Помечаем на удаление
                                      setDeletedAttachmentIds([...deletedAttachmentIds, attachment.id]);
                                    }}
                                    className="p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
                                    title="Удалить изображение"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-700/50">
                                <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <span className="text-gray-700 dark:text-gray-300 truncate flex-1 text-sm">
                                  {attachment.originalName}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeletedAttachmentIds([...deletedAttachmentIds, attachment.id]);
                                  }}
                                  className="p-1 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                  title="Удалить файл"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
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

      {/* Модалки для вставки изображений и видео при редактировании */}
      {isEditImageModalOpen && (
        <ImageInsertModal
          isOpen={isEditImageModalOpen}
          onClose={() => {
            setIsEditImageModalOpen(false);
            setImageInsertMode("content");
          }}
          onUpload={handleEditImageUpload}
          onGenerate={(imageUrl: string) => {
            // ImageInsertModal уже сгенерировал изображение и передает готовый URL
            console.log("[PostCard] Inserting generated image:", imageUrl);
            handleEditImageGenerate(imageUrl);
          }}
          generating={false}
        />
      )}

      {isEditVideoModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
          onClick={() => {
            setIsEditVideoModalOpen(false);
            setIsVideoModalForCover(false);
          }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {isVideoModalForCover ? "Добавить видео-обложку" : "Вставить видео"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditVideoModalOpen(false);
                  setIsVideoModalForCover(false);
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <input
              type="url"
              placeholder="Вставьте ссылку на YouTube, Rutube или VK видео"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const input = e.target as HTMLInputElement;
                  if (input.value) {
                    handleEditVideoInsert(input.value);
                    input.value = "";
                  }
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                const input = document.querySelector('input[type="url"]') as HTMLInputElement;
                if (input?.value) {
                  handleEditVideoInsert(input.value);
                  input.value = "";
                }
              }}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Вставить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

