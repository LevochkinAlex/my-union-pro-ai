"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import RichTextEditor from "@/components/admin/RichTextEditor";
import ImageInsertModal from "./ImageInsertModal";
import { compressImages } from "@/lib/compress-image";
import { useToast } from "@/components/ui/Toast";
import PromptModal from "@/components/ui/PromptModal";

interface CreatePostProps {
  onPostCreated?: () => void;
  compact?: boolean;
}

export default function CreatePost({ onPostCreated, compact = false }: CreatePostProps = {} as CreatePostProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast } = useToast();
  const [content, setContent] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [postType, setPostType] = useState<"text" | "article">("text");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [linkMetadata, setLinkMetadata] = useState<any>(null);
  const [videoMetadata, setVideoMetadata] = useState<any>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isArticleModalOpen, setIsArticleModalOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isImageModalForCover, setIsImageModalForCover] = useState(false);
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const articleEditorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && session?.user?.id) {
      loadUserProfile();
    }
  }, [mounted, session?.user?.id]);

  const loadUserProfile = async () => {
    try {
      const response = await fetch("/api/profile");
      if (response.ok) {
        const result = await response.json();
        const data = result.user || result;
        
        let avatar = data.avatarUrl;
        if (avatar) {
          if (avatar.startsWith('data:') || avatar.startsWith('http://') || avatar.startsWith('https://')) {
            setAvatarUrl(avatar);
          } else {
            avatar = avatar.startsWith('/') ? avatar : `/${avatar}`;
            setAvatarUrl(avatar);
          }
        } else {
          setAvatarUrl(null);
        }
        
        const nameParts = [
          data.firstName,
          data.middleName,
          data.lastName
        ].filter(Boolean);
        
        const fullName = nameParts.length > 0 
          ? nameParts.join(" ").trim()
          : (data.email?.split("@")[0] || session?.user?.name || session?.user?.email?.split("@")[0] || "Пользователь");
        
        setUserName(fullName);
      } else {
        if (session?.user?.name) {
          setUserName(session.user.name);
        } else if (session?.user?.email) {
          setUserName(session.user.email.split("@")[0]);
        }
      }
    } catch (error) {
      console.error("Error loading user profile:", error);
      if (session?.user?.name) {
        setUserName(session.user.name);
      } else if (session?.user?.email) {
        setUserName(session.user.email.split("@")[0]);
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles(files);
    const previews = files.map((file) => {
      if (file.type.startsWith("image/")) {
        return URL.createObjectURL(file);
      }
      return "";
    });
    setFilePreviews(previews);
    if (!isModalOpen) {
      openModal();
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setSelectedFiles([file]);
      setFilePreviews([URL.createObjectURL(file)]);
      if (!isModalOpen) {
        openModal();
      }
    }
  };

  const handleLinkUrlChange = async (url: string) => {
    setLinkUrl(url);
    if (url && url.startsWith("http")) {
      try {
        const response = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
        if (response.ok) {
          const data = await response.json();
          setLinkMetadata(data);
        }
      } catch (error) {
        console.error("Error fetching link metadata:", error);
      }
    } else {
      setLinkMetadata(null);
    }
  };

  const handleVideoUrlChange = async (url: string) => {
    setVideoUrl(url);
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
        setVideoMetadata({ provider, videoId, embedUrl });
      }
    } else {
      setVideoMetadata(null);
    }
  };

  const handleInsertImage = () => {
    // Сохраняем позицию курсора перед открытием модалки
    if (articleEditorRef.current) {
      const editor = articleEditorRef.current.querySelector('[contenteditable="true"]') as any;
      if (editor?.saveSelection) {
        editor.saveSelection();
      }
    }
    // Вставка через WYSIWYG - в HTML, не cover
    setIsImageModalForCover(false);
    setIsImageModalOpen(true);
  };

  const handleInsertVideo = () => {
    // Сохраняем позицию курсора перед открытием модалки
    if (articleEditorRef.current) {
      const editor = articleEditorRef.current.querySelector('[contenteditable="true"]') as any;
      if (editor?.saveSelection) {
        editor.saveSelection();
      }
    }
    setIsVideoModalOpen(true);
  };

  const handleImageUpload = async (file: File) => {
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
        const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${window.location.origin}${imageUrl}`;
        
        if (isImageModalForCover || postType === "text") {
          // Для обычного поста или cover изображения - добавляем как превью
          setFilePreviews([fullImageUrl]);
          setSelectedFiles([]); // Очищаем файлы, т.к. используем URL
          setCoverImage(fullImageUrl);
          setIsImageModalOpen(false);
          setIsImageModalForCover(false);
        } else {
          // Если это вставка в HTML (через WYSIWYG) для статьи
          if (articleEditorRef.current) {
            const editor = articleEditorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
            if (editor) {
              const img = document.createElement('img');
              img.src = fullImageUrl;
              img.alt = file.name;
              img.style.maxWidth = '100%';
              img.style.height = 'auto';
              img.style.borderRadius = '8px';
              img.style.margin = '8px 0';
              
              const selection = window.getSelection();
              if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.insertNode(img);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
              } else {
                editor.appendChild(img);
              }
              
              const event = new Event('input', { bubbles: true });
              editor.dispatchEvent(event);
            }
          }
          setIsImageModalOpen(false);
        }
      } else {
        const errorMessage = data.error || "Ошибка при загрузке изображения";
        console.error("[CreatePost] Upload error:", errorMessage, data);
        showToast(errorMessage, "error");
      }
    } catch (error) {
      console.error("Error uploading image:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при загрузке изображения";
      showToast(errorMessage, "error");
    }
  };

  const handleImageGenerate = async (imageUrl: string) => {
    const fullImageUrl = imageUrl.startsWith('http') ? imageUrl : `${window.location.origin}${imageUrl}`;
    
    if (isImageModalForCover || postType === "text") {
      // Для обычного поста или cover изображения - добавляем как превью
      // Для обычного поста заменяем существующее изображение
      setFilePreviews([fullImageUrl]);
      setSelectedFiles([]); // Очищаем файлы, т.к. используем URL
      setCoverImage(fullImageUrl); // Также сохраняем как cover
      setIsImageModalOpen(false);
      setIsImageModalForCover(false);
    } else {
      // Если это вставка в HTML (через WYSIWYG) для статьи
      if (articleEditorRef.current) {
        const editor = articleEditorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
        if (editor) {
          const img = document.createElement('img');
          img.src = fullImageUrl;
          img.alt = "Сгенерированное изображение";
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.borderRadius = '8px';
          img.style.margin = '8px 0';
          
          const selection = window.getSelection();
          if (selection && selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            range.insertNode(img);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
          } else {
            editor.appendChild(img);
          }
          
          const event = new Event('input', { bubbles: true });
          editor.dispatchEvent(event);
        }
      }
      setIsImageModalOpen(false);
    }
  };

  const handleVideoInsert = (url: string) => {
    let embedUrl = "";
    if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
      const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || "";
      embedUrl = `https://www.youtube.com/embed/${videoId}`;
    } else if (url.includes("rutube.ru/video/")) {
      const videoId = url.match(/rutube\.ru\/video\/([^\/\n?#]+)/)?.[1] || "";
      embedUrl = `https://rutube.ru/play/embed/${videoId}`;
    } else if (url.includes("vk.com/video")) {
      const match = url.match(/vk\.com\/video(-?\d+_\d+)/);
      if (match) {
        const videoId = match[1];
        embedUrl = `https://vk.com/video_ext.php?oid=${videoId.split("_")[0]}&id=${videoId.split("_")[1]}`;
      }
    }

    if (embedUrl && articleEditorRef.current) {
      const editor = articleEditorRef.current.querySelector('[contenteditable="true"]') as HTMLElement;
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
    }
    setIsVideoModalOpen(false);
  };

  const handleAiRewrite = async () => {
    const textToRewrite = postType === "article" ? htmlContent : content;
    if (!textToRewrite) return;
    
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai/rewrite-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: textToRewrite }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rewritten) {
          if (postType === "article") {
            setHtmlContent(data.rewritten);
          } else {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = data.rewritten;
            const plainText = tempDiv.textContent || tempDiv.innerText || data.rewritten;
            setContent(plainText);
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Ошибка при переписывании текста");
      }
    } catch (error) {
      console.error("Error rewriting with AI:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при переписывании текста с помощью AI";
      showToast(errorMessage, "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiContinue = async () => {
    const currentText = postType === "article" ? htmlContent : content;
    if (!currentText) return;
    
    setAiLoading(true);
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = currentText;
      const plainText = tempDiv.textContent || tempDiv.innerText || currentText;
      
      const response = await fetch("/api/ai/rewrite-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: plainText + "\n\n[Продолжи текст, развивая основную мысль и добавляя детали]" 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rewritten) {
          if (postType === "article") {
            setHtmlContent(data.rewritten);
          } else {
            const tempDiv2 = document.createElement("div");
            tempDiv2.innerHTML = data.rewritten;
            const plainText2 = tempDiv2.textContent || tempDiv2.innerText || data.rewritten;
            setContent(plainText2);
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        showToast(errorData.error || "Ошибка при дописывании текста с помощью AI", "error");
      }
    } catch (error) {
      console.error("Error continuing with AI:", error);
      showToast("Ошибка при дописывании текста с помощью AI", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiWrite = () => {
    setIsPromptModalOpen(true);
  };

  const handlePromptConfirm = async (userPrompt: string) => {
    setIsPromptModalOpen(false);
    if (!userPrompt || !userPrompt.trim()) return;
    
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai/rewrite-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: `Напиши пост на тему: ${userPrompt}. Пост должен быть интересным, информативным и хорошо структурированным.` 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rewritten) {
          if (postType === "article") {
            setHtmlContent(data.rewritten);
          } else {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = data.rewritten;
            const plainText = tempDiv.textContent || tempDiv.innerText || data.rewritten;
            setContent(plainText);
          }
          if (!isModalOpen && !isArticleModalOpen) {
            openModal();
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        showToast(errorData.error || "Ошибка при генерации текста с помощью AI", "error");
      }
    } catch (error) {
      console.error("Error writing with AI:", error);
      showToast("Ошибка при генерации текста с помощью AI", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleAiImprove = async () => {
    const textToImprove = postType === "article" ? htmlContent : content;
    if (!textToImprove) return;
    
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToImprove }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.improvedText) {
          if (postType === "article") {
            setHtmlContent(data.improvedText);
          } else {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = data.improvedText;
            const plainText = tempDiv.textContent || tempDiv.innerText || data.improvedText;
            setContent(plainText);
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        showToast(errorData.error || "Ошибка при улучшении текста с помощью AI", "error");
      }
    } catch (error) {
      console.error("Error improving text with AI:", error);
      showToast("Ошибка при улучшении текста с помощью AI", "error");
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalContent = postType === "article" ? htmlContent : content;
    if (!finalContent.trim() && selectedFiles.length === 0 && !linkUrl && !videoUrl) {
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("content", finalContent);
      formData.append("postType", postType === "article" ? "article" : "text");
      
      if (linkMetadata) {
        formData.append("linkMetadata", JSON.stringify(linkMetadata));
      }
      
      if (videoMetadata) {
        formData.append("videoMetadata", JSON.stringify(videoMetadata));
      }

      if (coverImage) {
        formData.append("coverImage", coverImage);
      }

      const filesToUpload = await compressImages(selectedFiles);
      filesToUpload.forEach((file) => {
        formData.append("attachments", file);
      });

      const response = await fetch("/api/posts", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        filePreviews.forEach((preview) => {
          if (preview) URL.revokeObjectURL(preview);
        });
        setContent("");
        setHtmlContent("");
        setSelectedFiles([]);
        setFilePreviews([]);
        setLinkUrl("");
        setVideoUrl("");
        setLinkMetadata(null);
        setVideoMetadata(null);
        setCoverImage(null);
        setPostType("text");
        setIsModalOpen(false);
        setIsArticleModalOpen(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        if (imageInputRef.current) {
          imageInputRef.current.value = "";
        }
        if (onPostCreated) {
          onPostCreated();
        } else {
          router.refresh();
        }
      } else {
        showToast(data.error || "Ошибка при создании поста", "error");
      }
    } catch (error) {
      console.error("Error creating post:", error);
      showToast("Ошибка при создании поста", "error");
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setContent("");
    setSelectedFiles([]);
    setFilePreviews([]);
    setLinkUrl("");
    setVideoUrl("");
    setLinkMetadata(null);
    setVideoMetadata(null);
    setPostType("text");
  };

  const openArticleModal = () => {
    setIsArticleModalOpen(true);
    setPostType("article");
    setHtmlContent("");
  };

  const closeArticleModal = () => {
    setIsArticleModalOpen(false);
    setHtmlContent("");
    setPostType("text");
  };

  const handlePostTypeClick = (type: "image" | "video" | "file" | "article") => {
    if (type === "image") {
      imageInputRef.current?.click();
    } else if (type === "file") {
      fileInputRef.current?.click();
    } else if (type === "video") {
      setPostType("text");
      setSelectedFiles([]);
      setVideoUrl("");
      openModal();
    } else if (type === "article") {
      openArticleModal();
    }
  };

  if (!mounted || !session) {
    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 lg:p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
          <div className="flex-1 h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Компактный вид */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 lg:p-4">
        <div className="flex items-start gap-3">
          {/* Аватар */}
          <div className="flex-shrink-0 relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-10 h-10 lg:w-12 lg:h-12 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  const fallback = target.nextElementSibling as HTMLElement;
                  if (fallback) {
                    fallback.style.display = 'flex';
                  }
                }}
              />
            ) : null}
            <div 
              className={`w-10 h-10 lg:w-12 lg:h-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm lg:text-base ${avatarUrl ? 'hidden' : ''}`}
            >
              {userName ? userName.charAt(0).toUpperCase() : session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || "U"}
            </div>
          </div>

          {/* Поле ввода */}
          <div className="flex-1">
            <button
              type="button"
              onClick={openModal}
              className="w-full text-left px-4 py-2.5 lg:py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors text-sm lg:text-base"
            >
              О чем вы думаете?
            </button>
          </div>
        </div>

        {/* Иконки действий */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => handlePostTypeClick("image")}
            className="flex items-center gap-2 px-3 py-1.5 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-1 justify-center"
            title="Фото"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline text-xs lg:text-sm">Фото</span>
          </button>

          <button
            type="button"
            onClick={() => handlePostTypeClick("video")}
            className="flex items-center gap-2 px-3 py-1.5 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-1 justify-center"
            title="Видео"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span className="hidden sm:inline text-xs lg:text-sm">Видео</span>
          </button>

          <button
            type="button"
            onClick={() => handlePostTypeClick("file")}
            className="flex items-center gap-2 px-3 py-1.5 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-1 justify-center"
            title="Файл"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <span className="hidden sm:inline text-xs lg:text-sm">Файл</span>
          </button>

          <button
            type="button"
            onClick={() => handlePostTypeClick("article")}
            className="flex items-center gap-2 px-3 py-1.5 lg:py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-1 justify-center"
            title="Статья"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span className="hidden sm:inline text-xs lg:text-sm">Статья</span>
          </button>
        </div>
      </div>

      {/* Модальное окно для обычного поста */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md dark:backdrop-blur-lg" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Заголовок модалки */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div 
                  className={`w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold ${avatarUrl ? 'hidden' : ''}`}
                >
                  {userName ? userName.charAt(0).toUpperCase() : session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {userName || session?.user?.name || "Пользователь"}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Публикация для всех</div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Контент модалки */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
              <form onSubmit={handleSubmit} className="p-4 lg:p-6 space-y-4">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="О чем вы думаете?"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[200px]"
                />

                {/* Превью обложки для обычного поста */}
                {coverImage && (
                  <div className="relative">
                    <img
                      src={coverImage}
                      alt="Обложка поста"
                      className="w-full max-h-64 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImage(null)}
                      className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      title="Удалить обложку"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Выбранные файлы */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="space-y-2">
                        {file.type.startsWith("image/") && filePreviews[index] ? (
                          <div className="relative">
                            <img
                              src={filePreviews[index]}
                              alt={file.name}
                              className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                URL.revokeObjectURL(filePreviews[index]);
                                setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
                                setFilePreviews(filePreviews.filter((_, i) => i !== index));
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
                                if (filePreviews[index]) {
                                  URL.revokeObjectURL(filePreviews[index]);
                                }
                                setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
                                setFilePreviews(filePreviews.filter((_, i) => i !== index));
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

                {/* Поле для ссылки */}
                {linkUrl && (
                  <input
                    type="url"
                    value={linkUrl}
                    onChange={(e) => handleLinkUrlChange(e.target.value)}
                    placeholder="Вставьте ссылку"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                )}

                {/* Поле для видео */}
                {videoUrl && (
                  <input
                    type="url"
                    value={videoUrl}
                    onChange={(e) => handleVideoUrlChange(e.target.value)}
                    placeholder="Вставьте ссылку на YouTube, Rutube или VK видео"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                )}

                {/* Превью ссылки */}
                {linkMetadata && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <a href={linkMetadata.url} target="_blank" rel="noopener noreferrer" className="block">
                      <h4 className="font-semibold text-gray-900 dark:text-white">{linkMetadata.title}</h4>
                      {linkMetadata.description && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {linkMetadata.description}
                        </p>
                      )}
                    </a>
                  </div>
                )}

                {/* Превью видео */}
                {videoMetadata && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <iframe
                      src={videoMetadata.embedUrl}
                      className="w-full h-64 rounded"
                      allowFullScreen
                    />
                  </div>
                )}
              </form>
            </div>

            {/* Футер модалки */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImageModalForCover(true);
                    setIsImageModalOpen(true);
                  }}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Добавить обложку"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVideoUrl("");
                    setLinkUrl("");
                    setSelectedFiles([]);
                    setIsVideoModalOpen(true);
                  }}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Добавить видео"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleAiWrite}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Написать с ИИ"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  {aiLoading ? "Генерация..." : "Написать с ИИ"}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || ((!content.trim()) && selectedFiles.length === 0 && !linkUrl && !videoUrl)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Публикация..." : "Опубликовать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно для статьи */}
      {isArticleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md dark:backdrop-blur-lg" onClick={(e) => e.target === e.currentTarget && closeArticleModal()}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Заголовок модалки */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-10 h-10 rounded-full object-cover border border-gray-200 dark:border-gray-700"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const fallback = target.nextElementSibling as HTMLElement;
                      if (fallback) {
                        fallback.style.display = 'flex';
                      }
                    }}
                  />
                ) : null}
                <div 
                  className={`w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold ${avatarUrl ? 'hidden' : ''}`}
                >
                  {userName ? userName.charAt(0).toUpperCase() : session?.user?.name?.charAt(0).toUpperCase() || session?.user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {userName || session?.user?.name || "Пользователь"}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">Создание статьи</div>
                </div>
              </div>
              <button
                type="button"
                onClick={closeArticleModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Контент модалки */}
            <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
              <form onSubmit={handleSubmit} className="p-4 lg:p-6 space-y-4">
                {/* WYSIWYG редактор */}
                {/* Превью обложки статьи */}
                {coverImage && (
                  <div className="relative mb-4">
                    <img
                      src={coverImage}
                      alt="Обложка статьи"
                      className="w-full h-64 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                    />
                    <button
                      type="button"
                      onClick={() => setCoverImage(null)}
                      className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      title="Удалить обложку"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                <div ref={articleEditorRef}>
                  <RichTextEditor
                    value={htmlContent}
                    onChange={setHtmlContent}
                    placeholder="Начните писать статью..."
                    onInsertImage={handleInsertImage}
                    onInsertVideo={handleInsertVideo}
                  />
                </div>

                {/* AI кнопки */}
                {htmlContent.trim() && (
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={handleAiImprove}
                      disabled={aiLoading}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      {aiLoading ? "Улучшение..." : "Улучшить с AI"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAiRewrite}
                      disabled={aiLoading}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {aiLoading ? "Переписывание..." : "Переписать с AI"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAiContinue}
                      disabled={aiLoading}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {aiLoading ? "Дописывание..." : "Дописать с AI"}
                    </button>
                  </div>
                )}
              </form>
            </div>

            {/* Футер модалки */}
            <div className="flex items-center justify-between p-4 lg:p-6 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsImageModalForCover(true);
                    setIsImageModalOpen(true);
                  }}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Добавить обложку"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleInsertVideo}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="Вставить видео"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={handleAiWrite}
                  disabled={aiLoading}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Написать с ИИ"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  {aiLoading ? "Генерация..." : "Написать с ИИ"}
                </button>
              </div>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !htmlContent.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "Публикация..." : "Опубликовать"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка для вставки изображения */}
      <ImageInsertModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onUpload={handleImageUpload}
        onGenerate={handleImageGenerate}
        generating={generatingImage}
      />

      {/* Модалка для вставки видео */}
      {isVideoModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md"
          onClick={() => setIsVideoModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Вставить видео
              </h3>
              <button
                type="button"
                onClick={() => setIsVideoModalOpen(false)}
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
                    handleVideoInsert(input.value);
                    input.value = "";
                  }
                }
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                const input = (e.target as HTMLElement).previousElementSibling as HTMLInputElement;
                if (input?.value) {
                  handleVideoInsert(input.value);
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

      {/* Модалка для ввода текста (prompt) */}
      <PromptModal
        isOpen={isPromptModalOpen}
        title="Написать с ИИ"
        message="О чем вы хотите написать?"
        placeholder="Введите тему поста..."
        onConfirm={handlePromptConfirm}
        onCancel={() => setIsPromptModalOpen(false)}
      />

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept="image/*,video/*,.pdf,.doc,.docx,.txt,.heic,.heif"
        multiple
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageSelect}
        className="hidden"
        accept="image/*,.heic,.heif"
      />
    </>
  );
}
