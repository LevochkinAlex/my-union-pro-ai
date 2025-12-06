"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import AlertDialog from "@/components/ui/AlertDialog";
import { useToast } from "@/components/ui/Toast";
import ImageModal from "@/components/chat/ImageModal";
import EmojiPicker from "@/components/chat/EmojiPicker";
import heic2any from "heic2any";

interface Chat {
  id: string;
  otherUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
    phone: string | null;
  };
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
}

interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToId?: string | null;
  replyTo?: Message | null;
  forwardedFromId?: string | null;
  forwardedFrom?: Message | null;
  sender: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName: string | null;
    avatarUrl: string | null;
  };
  attachments?: {
    id: string;
    type: string;
    fileName: string;
    originalName: string;
    filePath: string;
    fileSize: number;
    mimeType: string | null;
  }[];
}

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  avatarUrl: string | null;
  phone: string | null;
  jobTitle: string | null;
  profession: string | null;
  organization: {
    id: string;
    name: string;
  } | null;
}

function ChatPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { showToast } = useToast();
  const currentUserId = session?.user?.id || null;
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [showChatView, setShowChatView] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editMessageText, setEditMessageText] = useState("");
  const [editMessageFile, setEditMessageFile] = useState<File | null>(null);
  const [editMessageFilePreview, setEditMessageFilePreview] = useState<string | null>(null);
  const editMessageFileInputRef = useRef<HTMLInputElement>(null);
  const [replyingToMessage, setReplyingToMessage] = useState<Message | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<Message | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardSearchQuery, setForwardSearchQuery] = useState("");
  const [forwardUsers, setForwardUsers] = useState<any[]>([]);
  const [forwardLoading, setForwardLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ url: string; name?: string } | null>(null);
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);
  const [messageLikes, setMessageLikes] = useState<Record<string, { 
    emoji: string; 
    count: number; 
    isLiked: boolean;
    users?: Array<{ id: string; avatarUrl: string | null; name: string }>;
  }>>({});
  const [avatarLoadErrors, setAvatarLoadErrors] = useState<Set<string>>(new Set());
  const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null);
  const lastDoubleClickRef = useRef<{ messageId: string; timestamp: number } | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressMessageIdRef = useRef<string | null>(null);
  const [alertDialog, setAlertDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "alert" | "confirm";
    onConfirm?: () => void;
    onCancel?: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "alert",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isUserScrolling = useRef(false);
  const lastScrollTop = useRef(0);
  const shouldScrollToBottom = useRef(true);

  // Используем useEffect для получения userId после монтирования, чтобы избежать ошибок гидратации
  const [userId, setUserId] = useState<string | null>(null);
  const [botChatId, setBotChatId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    setUserId(searchParams.get("userId"));
    setBotChatId(searchParams.get("botChatId"));
    
    // Очистка превью при размонтировании
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, [searchParams, filePreview]);

  useEffect(() => {
    loadChats();
  }, []);

  // Открываем чат с ботом, если передан botChatId
  useEffect(() => {
    if (botChatId && chats.length > 0) {
      const botChat = chats.find((chat) => chat.id === botChatId);
      if (botChat) {
        setSelectedChat(botChat);
        loadMessages(botChat.id, false);
      }
    }
  }, [botChatId, chats]);

  useEffect(() => {
    if (userId && currentUserId) {
      // Проверяем, что это не попытка создать чат с самим собой
      if (userId === currentUserId) {
        console.warn("Попытка создать чат с самим собой, игнорируем");
        router.replace("/dashboard/chat", { scroll: false });
        return;
      }
      // Если передан userId, создаем или открываем чат с этим пользователем
      createOrOpenChat(userId);
    }
  }, [userId, currentUserId]);

  useEffect(() => {
    if (selectedChat) {
      shouldScrollToBottom.current = true; // При открытии нового чата всегда скроллим вниз
      loadMessages(selectedChat.id);
      // Обновляем список чатов после выбора
      loadChats();
    }
  }, [selectedChat]);

  useEffect(() => {
    // Прокручиваем к последнему сообщению только если нужно
    if (shouldScrollToBottom.current && messages.length > 0) {
      const timer = setTimeout(() => {
        scrollToBottom(true);
        shouldScrollToBottom.current = false;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  useEffect(() => {
    // Автообновление сообщений каждые 5 секунд
    if (selectedChat) {
      const interval = setInterval(() => {
        loadMessages(selectedChat.id, true);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [selectedChat]);

  // Heartbeat - отмечаем чат как активный каждые 20 секунд, когда он открыт
  useEffect(() => {
    if (selectedChat) {
      const sendHeartbeat = async () => {
        try {
          await fetch(`/api/chat/${selectedChat.id}/activity`, {
            method: "POST",
          });
        } catch (error) {
          console.error("Error sending heartbeat:", error);
        }
      };

      // Отправляем heartbeat сразу при открытии чата
      sendHeartbeat();

      // Затем каждые 20 секунд
      const heartbeatInterval = setInterval(() => {
        sendHeartbeat();
      }, 20000);

      return () => clearInterval(heartbeatInterval);
    }
  }, [selectedChat]);

  const scrollToBottom = (force = false) => {
    requestAnimationFrame(() => {
      if (messagesContainerRef.current) {
        const container = messagesContainerRef.current;
        if (force) {
          container.scrollTop = container.scrollHeight;
        } else {
          container.scrollTo({
            top: container.scrollHeight,
            behavior: "smooth"
          });
        }
      }
    });
  };

  // Проверяем, находится ли пользователь внизу чата
  const isNearBottom = () => {
    if (!messagesContainerRef.current) return true;
    const container = messagesContainerRef.current;
    const threshold = 150; // Порог в пикселях
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  };

  // Обработчик скролла для отслеживания позиции пользователя
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const container = messagesContainerRef.current;
    
    // Определяем направление скролла
    const scrollingUp = container.scrollTop < lastScrollTop.current;
    lastScrollTop.current = container.scrollTop;
    
    // Если пользователь скроллит вверх, помечаем это
    if (scrollingUp) {
      isUserScrolling.current = true;
    }
    
    // Если пользователь дошел до низа, сбрасываем флаг
    if (isNearBottom()) {
      isUserScrolling.current = false;
    }
  };

  // Авторесайз textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [messageText]);

  const loadChats = async () => {
    try {
      const response = await fetch("/api/chat");
      if (response.ok) {
        const data = await response.json();
        setChats(data.chats || []);
        
        // Если есть userId и чат еще не выбран, выбираем его
        if (userId && !selectedChat) {
          const chat = data.chats?.find((c: Chat) => c.otherUser.id === userId);
          if (chat) {
            setSelectedChat(chat);
          }
        }
      }
    } catch (error) {
      console.error("Error loading chats:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (chatId: string, silent = false) => {
    try {
      const response = await fetch(`/api/chat/${chatId}?t=${Date.now()}`);
      if (response.ok) {
        const data = await response.json();
        const newMessages = data.messages || [];
        
        // Фильтруем удаленные сообщения
        // API уже фильтрует по deletedAt: null, но для безопасности проверяем и на фронтенде
        const filteredMessages = newMessages.filter((m: Message) => {
          // Сообщение не удалено, если deletedAt отсутствует, равен null, undefined или пустой строке
          return !m.deletedAt;
        });
        
        // При тихом обновлении проверяем, есть ли изменения
        if (silent) {
          const hasNewMessages = filteredMessages.length !== messages.length || 
            filteredMessages.some((m: Message, i: number) => 
              !messages[i] || messages[i].id !== m.id || messages[i].content !== m.content || messages[i].deletedAt !== m.deletedAt
            );
          
          if (hasNewMessages) {
            setMessages(filteredMessages);
            // Автоскролл только если пользователь внизу
            if (isNearBottom() && !isUserScrolling.current) {
              setTimeout(() => scrollToBottom(true), 50);
            }
          }
        } else {
          // При полной загрузке всегда обновляем
          setMessages(filteredMessages);
          // При первой загрузке чата всегда скроллим вниз
          shouldScrollToBottom.current = true;
        }
      }
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const createOrOpenChat = async (targetUserId: string) => {
    // Проверяем, что это не попытка создать чат с самим собой
    if (currentUserId && targetUserId === currentUserId) {
      showToast("Нельзя создать чат с самим собой", "warning");
      router.replace("/dashboard/chat", { scroll: false });
      return;
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId }),
      });

      const data = await response.json();

      if (response.ok) {
        const newChat: Chat = {
          id: data.chat.id,
          otherUser: data.chat.otherUser,
          lastMessage: null,
          lastMessageAt: null,
          unreadCount: 0,
        };
        
        // Сначала очищаем поиск
        setSearchQuery("");
        setSearchResults([]);
        setShowSearch(false);
        
        // Устанавливаем выбранный чат
        setSelectedChat(newChat);
        setShowChatView(true);
        
        // Загружаем сообщения для нового чата
        await loadMessages(newChat.id);
        
        // Обновляем список чатов
        await loadChats();
        
        // Убираем userId из URL
        router.replace("/dashboard/chat", { scroll: false });
      } else {
        console.error("Error creating chat:", data);
        const errorMessage = data.details 
          ? `${data.error}: ${data.details}`
          : data.error || "Ошибка при создании чата";
        setAlertDialog({
          isOpen: true,
          title: "Ошибка",
          message: errorMessage,
          type: "alert",
          onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    } catch (error) {
      console.error("Error creating chat:", error);
      setAlertDialog({
        isOpen: true,
        title: "Ошибка",
        message: "Ошибка при создании чата. Попробуйте еще раз.",
        type: "alert",
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
      });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Проверяем, является ли файл HEIC/HEIF
    const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                   file.name.toLowerCase().endsWith('.heif') ||
                   file.type === 'image/heic' ||
                   file.type === 'image/heif';

    if (isHeic) {
      setIsConvertingHeic(true);
      try {
        // Конвертируем HEIC в JPEG для превью
        const convertedBlob = await heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.8,
        });
        
        // heic2any может вернуть массив или один blob
        const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
        
        // Создаем File объект из blob для дальнейшей работы
        const jpegFile = new File([blob as Blob], file.name.replace(/\.(heic|heif)$/i, ".jpg"), {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
        
        setSelectedFile(jpegFile);
        const url = URL.createObjectURL(blob as Blob);
        setFilePreview(url);
        setIsConvertingHeic(false);
      } catch (error) {
        console.error("Error converting HEIC:", error);
        showToast("Ошибка при конвертации HEIC изображения", "error");
        setIsConvertingHeic(false);
        setSelectedFile(file);
        setFilePreview(null);
      }
    } else if (file.type.startsWith("image/")) {
      setSelectedFile(file);
      setFilePreview(URL.createObjectURL(file));
    } else {
      setSelectedFile(file);
      setFilePreview(null);
    }
  };

  const sendMessage = async () => {
    if (!selectedChat || (!messageText.trim() && !selectedFile) || sending) return;

    const content = messageText.trim();
    const file = selectedFile;
    const replyTo = replyingToMessage;
    
    // Сохраняем исходное состояние для отката
    const originalMessages = [...messages];
    
    // Оптимистичное обновление - сразу показываем сообщение в UI
    const tempMessageId = `temp-${Date.now()}-${Math.random()}`;
    const optimisticMessage: Message = {
      id: tempMessageId,
      content: content || (file ? file.name : ""),
      senderId: currentUserId || "",
      createdAt: new Date().toISOString(),
      sender: {
        id: currentUserId || "",
        firstName: session?.user?.firstName || session?.user?.name?.split(" ")[0] || null,
        lastName: session?.user?.lastName || session?.user?.name?.split(" ")[1] || null,
        middleName: session?.user?.name?.split(" ")[2] || null,
        avatarUrl: session?.user?.avatarUrl || null,
      },
      replyToId: replyTo?.id || null,
      replyTo: replyTo || null,
      attachments: file ? [{
        id: `temp-attachment-${Date.now()}`,
        type: file.type.startsWith("image/") ? "image" : "file",
        fileName: file.name,
        originalName: file.name,
        filePath: filePreview || "",
        fileSize: file.size,
        mimeType: file.type,
      }] : undefined,
    };
    
    setMessages(prev => [...prev, optimisticMessage]);
    setSending(true);
    
    // Очищаем поля сразу для быстрой отправки следующего сообщения
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setMessageText("");
    setSelectedFile(null);
    setFilePreview(null);
    setReplyingToMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }
    shouldScrollToBottom.current = true;
    isUserScrolling.current = false;
    scrollToBottom(true);

    try {
      let response;
      
      const messageData: any = {
        content: content,
      };

      if (replyTo) {
        messageData.replyToId = replyTo.id;
      }
      
      if (file) {
        // Отправляем файл
        const formData = new FormData();
        formData.append("file", file);
        if (content) {
          formData.append("content", content);
        }
        if (replyTo) {
          formData.append("replyToId", replyTo.id);
        }
        
        response = await fetch(`/api/chat/${selectedChat.id}/attachments`, {
          method: "POST",
          body: formData,
        });
      } else {
        // Отправляем текстовое сообщение
        response = await fetch(`/api/chat/${selectedChat.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(messageData),
        });
      }

      const data = await response.json();

      if (response.ok) {
        // Заменяем временное сообщение на реальное
        setMessages(prev => {
          // Удаляем временное сообщение
          const filtered = prev.filter(m => m.id !== tempMessageId);
          if (data.message) {
            // Проверяем, нет ли уже такого сообщения в списке (по ID)
            const messageExists = filtered.some(m => m.id === data.message.id);
            if (!messageExists) {
              return [...filtered, data.message];
            }
            return filtered;
          }
          return filtered;
        });
        
        // Обновляем список чатов в фоне (не блокируем UI)
        loadChats();
      } else {
        // Откатываем изменения при ошибке
        setMessages(originalMessages);
        console.error("Error sending message:", data);
        const errorMessage = data.details 
          ? `${data.error}: ${data.details}`
          : data.error || "Ошибка при отправке сообщения";
        setAlertDialog({
          isOpen: true,
          title: "Ошибка",
          message: errorMessage,
          type: "alert",
          onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    } catch (error) {
      // Откатываем изменения при ошибке
      setMessages(originalMessages);
      console.error("Error sending message:", error);
      setAlertDialog({
        isOpen: true,
        title: "Ошибка",
        message: "Ошибка при отправке сообщения. Попробуйте еще раз.",
        type: "alert",
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
      });
    } finally {
      setSending(false);
    }
  };

  const handleEditMessage = async (messageId: string) => {
    if (!editMessageText.trim() && !editMessageFile) {
      setAlertDialog({
        isOpen: true,
        title: "Ошибка",
        message: "Сообщение не может быть пустым",
        type: "alert",
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    if (!selectedChat) return;

    try {
      let response;
      
      if (editMessageFile) {
        // Отправляем с файлом через FormData
        const formData = new FormData();
        formData.append("content", editMessageText.trim() || "");
        formData.append("file", editMessageFile);
        
        response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
          method: "PATCH",
          body: formData,
        });
      } else {
        // Отправляем только текст
        response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: editMessageText }),
        });
      }

      if (response.ok) {
        // Очищаем превью
        if (editMessageFilePreview) {
          URL.revokeObjectURL(editMessageFilePreview);
        }
        setEditingMessageId(null);
        setEditMessageText("");
        setEditMessageFile(null);
        setEditMessageFilePreview(null);
        if (editMessageFileInputRef.current) {
          editMessageFileInputRef.current.value = "";
        }
        loadMessages(selectedChat.id);
      } else {
        const data = await response.json();
        setAlertDialog({
          isOpen: true,
          title: "Ошибка",
          message: data.error || "Ошибка при редактировании сообщения",
          type: "alert",
          onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    } catch (error) {
      console.error("Error editing message:", error);
      setAlertDialog({
        isOpen: true,
        title: "Ошибка",
        message: "Ошибка при редактировании сообщения",
        type: "alert",
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
      });
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setAlertDialog({
      isOpen: true,
      title: "Удаление сообщения",
      message: "Вы уверены, что хотите удалить это сообщение?",
      type: "confirm",
      onConfirm: async () => {
        setAlertDialog((prev) => ({ ...prev, isOpen: false }));
        if (!selectedChat) return;

        // Сохраняем исходное состояние для отката
        const originalMessages = [...messages];
        
        // Оптимистичное обновление - сразу скрываем сообщение из UI
        setMessages(prev => prev.filter(m => m.id !== messageId));

        try {
          const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            const result = await response.json();
            console.error("[chat] Delete error:", result);
            // Откатываем изменения при ошибке
            setMessages(originalMessages);
            setAlertDialog({
              isOpen: true,
              title: "Ошибка",
              message: result.error || "Ошибка при удалении сообщения",
              type: "alert",
              onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
            });
          } else {
            const result = await response.json();
            console.log("[chat] Delete success:", result);
            // Успешно удалено - обновляем сообщения с сервера (не тихое обновление, чтобы точно обновилось)
            await loadMessages(selectedChat.id, false);
            // Также принудительно обновляем список чатов, чтобы обновилось последнее сообщение
            await loadChats();
          }
        } catch (error) {
          console.error("Error deleting message:", error);
          // Откатываем изменения при ошибке
          setMessages(originalMessages);
          setAlertDialog({
            isOpen: true,
            title: "Ошибка",
            message: "Ошибка при удалении сообщения",
            type: "alert",
            onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
          });
        }
      },
      onCancel: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
    });
  };

  // Поиск пользователей для пересылки
  const searchUsersForForward = async (query: string) => {
    if (!query.trim()) {
      setForwardUsers([]);
      return;
    }

    setForwardLoading(true);
    try {
      const response = await fetch(`/api/users?search=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        // Исключаем текущего пользователя из списка
        const filteredUsers = (data.users || []).filter(
          (user: any) => user.id !== currentUserId
        );
        setForwardUsers(filteredUsers);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setForwardLoading(false);
    }
  };

  // Пересылка сообщения
  const handleForwardMessage = async (targetUserId: string) => {
    if (!forwardingMessage) return;

    try {
      const response = await fetch("/api/chat/forward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId: forwardingMessage.id,
          targetUserId,
        }),
      });

      if (response.ok) {
        setShowForwardModal(false);
        setForwardingMessage(null);
        setForwardSearchQuery("");
        setForwardUsers([]);
        
        // Перезагружаем чаты, чтобы обновить список
        loadChats();
        
        // Если пересылаем в текущий чат, перезагружаем сообщения
        if (selectedChat) {
          const targetChat = chats.find((c: Chat) => {
            const otherUser = c.otherUser;
            return otherUser.id === targetUserId;
          });
          if (targetChat && targetChat.id === selectedChat.id) {
            loadMessages(selectedChat.id);
          }
        }
      } else {
        const data = await response.json();
        setAlertDialog({
          isOpen: true,
          title: "Ошибка",
          message: data.error || "Ошибка при пересылке сообщения",
          type: "alert",
          onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
        });
      }
    } catch (error) {
      console.error("Error forwarding message:", error);
      setAlertDialog({
        isOpen: true,
        title: "Ошибка",
        message: "Ошибка при пересылке сообщения",
        type: "alert",
        onConfirm: () => setAlertDialog((prev) => ({ ...prev, isOpen: false })),
      });
    }
  };

  const handleDeleteMessageConfirm = async (messageId: string) => {

    if (!selectedChat) return;

    try {
      const response = await fetch(`/api/chat/${selectedChat.id}/messages/${messageId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        loadMessages(selectedChat.id);
        showToast("Сообщение удалено", "success");
      } else {
        const data = await response.json();
        showToast(data.error || "Ошибка при удалении сообщения", "error");
      }
    } catch (error) {
      console.error("Error deleting message:", error);
      showToast("Ошибка при удалении сообщения", "error");
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await fetch(`/api/chat/search?search=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.users || []);
      }
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearching(false);
    }
  };

  const getUserName = (user: { firstName: string | null; lastName: string | null; middleName: string | null }) => {
    const parts = [user.firstName, user.middleName, user.lastName].filter(Boolean);
    return parts.join(" ") || "Пользователь";
  };

  const getInitials = (user: { firstName: string | null; lastName: string | null }) => {
    if (user.firstName && user.lastName) {
      return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    }
    return user.firstName?.[0] || user.lastName?.[0] || "?";
  };

  const formatTime = (dateString: string) => {
    if (!mounted) return ""; // Возвращаем пустую строку до монтирования, чтобы избежать ошибок гидратации
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return "только что";
    if (minutes < 60) return `${minutes} мин назад`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} ч назад`;
    return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  };

  // На мобильных устройствах показываем либо список, либо чат
  useEffect(() => {
    if (selectedChat) {
      setShowChatView(true);
    } else {
      setShowChatView(false);
    }
  }, [selectedChat]);

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
    return `/api/uploads/chat/${filename}`;
  };

  // Защита от hydration mismatch
  if (!mounted) {
    return (
      <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Список чатов */}
      <div className={`${showChatView ? 'hidden md:flex' : 'flex'} w-full md:w-1/3 border-r border-gray-200 dark:border-gray-700 flex-col bg-white dark:bg-gray-800`}>
        {/* Заголовок с поиском */}
        <div className="p-3 md:p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg md:text-xl font-semibold text-gray-900 dark:text-white">Чаты</h2>
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
          {showSearch && (
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Поиск..."
                className="w-full px-4 py-2.5 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <svg
                className="absolute left-3 top-3 h-5 w-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          )}
        </div>

        {/* Результаты поиска или список чатов */}
        <div className="flex-1 overflow-y-auto">
          {showSearch && searchQuery ? (
            <div>
              {searching ? (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">Поиск...</div>
              ) : searchResults.length > 0 ? (
                <div>
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Проверяем, что это не текущий пользователь
                        if (currentUserId && user.id === currentUserId) {
                          return;
                        }
                        createOrOpenChat(user.id);
                        setShowChatView(true);
                      }}
                      disabled={currentUserId === user.id}
                      className="w-full px-3 md:px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 border-b border-gray-100 dark:border-gray-700/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={getUserName(user)}
                          className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover flex-shrink-0"
                          onError={(e) => {
                            // Если изображение не загрузилось, скрываем его
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                          {getInitials(user)}
                        </div>
                      )}
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-medium text-gray-900 dark:text-white truncate text-sm md:text-base">
                          {getUserName(user)}
                        </p>
                        {user.jobTitle && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {user.jobTitle}
                          </p>
                        )}
                        {user.phone && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                            {user.phone}
                          </p>
                        )}
                      </div>
                      <svg
                        className="w-5 h-5 text-gray-400 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                  Пользователи не найдены
                </div>
              )}
            </div>
          ) : loading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
          ) : chats.length > 0 ? (
            <div>
                  {chats.map((chat) => {
                    // Проверяем, что это не чат с самим собой (на всякий случай)
                    if (currentUserId && chat.otherUser.id === currentUserId) {
                      return null;
                    }
                    return (
                <button
                  key={chat.id}
                  onClick={() => {
                    setSelectedChat(chat);
                    setShowChatView(true);
                  }}
                  className={`w-full px-3 md:px-4 py-3 flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 border-b border-gray-100 dark:border-gray-700/50 transition-colors ${
                    selectedChat?.id === chat.id ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  {chat.otherUser.avatarUrl ? (
                    <div className="relative flex-shrink-0">
                      <img
                        src={chat.otherUser.avatarUrl}
                        alt={getUserName(chat.otherUser)}
                        className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                      {getInitials(chat.otherUser)}
                    </div>
                  )}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <p className="font-medium text-gray-900 dark:text-white truncate text-sm md:text-base">
                        {getUserName(chat.otherUser)}
                      </p>
                      {chat.lastMessageAt && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap flex-shrink-0">
                          {mounted ? formatTime(chat.lastMessageAt.toString()) : ""}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate flex-1">
                        {chat.lastMessage || "Нет сообщений"}
                      </p>
                      {chat.unreadCount > 0 && (
                        <div className="min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center flex-shrink-0">
                          {chat.unreadCount > 99 ? '99+' : chat.unreadCount}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
                    );
                  })}
            </div>
          ) : (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              Нет чатов. Начните новый чат, нажав кнопку "+"
            </div>
          )}
        </div>
      </div>

      {/* Область сообщений */}
      <div className={`${showChatView ? 'flex' : 'hidden md:flex'} flex-1 flex-col`}>
        {selectedChat ? (
          <>
            {/* Заголовок чата */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex items-center gap-3 relative z-10">
              {/* Кнопка назад на мобильных */}
              <button
                onClick={() => {
                  setShowChatView(false);
                  setSelectedChat(null);
                }}
                className="md:hidden p-2 -ml-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <button
                onClick={() => {
                  router.push(`/dashboard/profile/${selectedChat.otherUser.id}`);
                }}
                className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
              >
              {selectedChat.otherUser.avatarUrl ? (
                <img
                  src={selectedChat.otherUser.avatarUrl}
                  alt={getUserName(selectedChat.otherUser)}
                    className="w-10 h-10 rounded-full flex-shrink-0"
                />
              ) : (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                  {getInitials(selectedChat.otherUser)}
                </div>
              )}
                <div className="flex-1 min-w-0 text-left">
                <p className="font-medium text-gray-900 dark:text-white truncate">
                  {getUserName(selectedChat.otherUser)}
                </p>
                {selectedChat.otherUser.phone && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {selectedChat.otherUser.phone}
                  </p>
                )}
              </div>
              </button>
            </div>

            {/* Сообщения */}
            <div
              ref={messagesContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto p-4 space-y-4"
            >
              {messages.map((message) => {
                const isOwn = message.senderId !== selectedChat.otherUser.id;
                const isDeleted = !!message.deletedAt;
                const isEditing = editingMessageId === message.id;
                const isHovered = hoveredMessageId === message.id;
                
                const handleLongPressStart = (e: React.TouchEvent) => {
                  if (isDeleted) return;
                  longPressMessageIdRef.current = message.id;
                  longPressTimerRef.current = setTimeout(() => {
                    setHoveredMessageId(message.id);
                    // Вибрация для тактильной обратной связи (если поддерживается)
                    if (navigator.vibrate) {
                      navigator.vibrate(50);
                    }
                  }, 500); // 500ms для долгого нажатия
                };

                const handleLongPressEnd = () => {
                  if (longPressTimerRef.current) {
                    clearTimeout(longPressTimerRef.current);
                    longPressTimerRef.current = null;
                  }
                  longPressMessageIdRef.current = null;
                };

                const handleTouchMove = () => {
                  // Отменяем долгое нажатие при движении
                  handleLongPressEnd();
                };
                
                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwn ? "justify-end" : "justify-start"} group relative`}
                    onMouseEnter={() => setHoveredMessageId(message.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                    onTouchStart={handleLongPressStart}
                    onTouchEnd={handleLongPressEnd}
                    onTouchMove={handleTouchMove}
                    onTouchCancel={handleLongPressEnd}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg relative ${
                        isOwn
                          ? "bg-blue-600 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"
                      } ${isDeleted ? "opacity-60" : ""}`}
                    >
                      {/* Действия при наведении (десктоп) или долгом нажатии (мобильный) */}
                      {isHovered && !isDeleted && !isEditing && (
                        <>
                          {/* Overlay для закрытия при клике вне меню на мобильных */}
                          <div 
                            className="fixed inset-0 z-40 md:hidden"
                            onClick={() => setHoveredMessageId(null)}
                            onTouchStart={() => setHoveredMessageId(null)}
                          />
                          <div className={`absolute ${isOwn ? "left-0 -translate-x-full mr-2 md:mr-0" : "right-0 translate-x-full ml-2 md:ml-0"} top-1/2 -translate-y-1/2 flex gap-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1 z-50`}>
                            {!isOwn && (
                              <button
                                onClick={() => {
                                  setReplyingToMessage(message);
                                  setHoveredMessageId(null);
                                }}
                                onTouchEnd={(e) => {
                                  e.preventDefault();
                                  setReplyingToMessage(message);
                                  setHoveredMessageId(null);
                                }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded transition-colors touch-manipulation"
                                title="Ответить"
                              >
                                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                </svg>
                              </button>
                            )}
                            {isOwn && (
                              <>
                                <button
                                  onClick={() => {
                                    setEditingMessageId(message.id);
                                    setEditMessageText(message.content);
                                    setEditMessageFile(null);
                                    setEditMessageFilePreview(null);
                                    if (editMessageFileInputRef.current) {
                                      editMessageFileInputRef.current.value = "";
                                    }
                                    setHoveredMessageId(null);
                                  }}
                                  onTouchEnd={(e) => {
                                    e.preventDefault();
                                    setEditingMessageId(message.id);
                                    setEditMessageText(message.content);
                                    setEditMessageFile(null);
                                    setEditMessageFilePreview(null);
                                    if (editMessageFileInputRef.current) {
                                      editMessageFileInputRef.current.value = "";
                                    }
                                    setHoveredMessageId(null);
                                  }}
                                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded transition-colors touch-manipulation"
                                  title="Редактировать"
                                >
                                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => {
                                    handleDeleteMessage(message.id);
                                    setHoveredMessageId(null);
                                  }}
                                  onTouchEnd={(e) => {
                                    e.preventDefault();
                                    handleDeleteMessage(message.id);
                                    setHoveredMessageId(null);
                                  }}
                                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded transition-colors touch-manipulation"
                                  title="Удалить"
                                >
                                  <svg className="w-4 h-4 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </>
                            )}
                            <div className="relative">
                              <button
                                onClick={() => {
                                  setEmojiPickerMessageId(emojiPickerMessageId === message.id ? null : message.id);
                                }}
                                onTouchEnd={(e) => {
                                  e.preventDefault();
                                  setEmojiPickerMessageId(emojiPickerMessageId === message.id ? null : message.id);
                                }}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded transition-colors touch-manipulation"
                                title="Добавить реакцию"
                              >
                                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </button>
                              {emojiPickerMessageId === message.id && (
                                <div className={`absolute bottom-full mb-2 z-50 ${isOwn ? "right-0" : "left-0"}`}>
                                  <EmojiPicker
                                    showButton={false}
                                    isOpen={true}
                                    onOpenChange={(open) => {
                                      if (!open) {
                                        setEmojiPickerMessageId(null);
                                      }
                                    }}
                                    onEmojiSelect={(emoji) => {
                                      // TODO: Отправить реакцию на сервер
                                      const currentUserId = session?.user?.id || "";
                                      const currentUserName = session?.user?.name || "Вы";
                                      const currentUserAvatar = session?.user?.avatarUrl || null;
                                      
                                      setMessageLikes(prev => {
                                        const existing = prev[message.id];
                                        const isAlreadyLiked = existing?.isLiked;
                                        
                                        if (isAlreadyLiked && existing?.emoji === emoji) {
                                          // Удаляем реакцию, если тот же эмодзи
                                          const newLikes = { ...prev };
                                          if (existing.count > 1) {
                                            newLikes[message.id] = {
                                              ...existing,
                                              count: existing.count - 1,
                                              isLiked: false,
                                              users: existing.users?.filter(u => u.id !== currentUserId),
                                            };
                                          } else {
                                            delete newLikes[message.id];
                                          }
                                          return newLikes;
                                        } else {
                                          // Добавляем новую реакцию
                                          return {
                                            ...prev,
                                            [message.id]: {
                                              emoji,
                                              count: (existing?.count || 0) + (isAlreadyLiked ? 0 : 1),
                                              isLiked: true,
                                              users: existing?.users 
                                                ? [...existing.users.filter(u => u.id !== currentUserId), {
                                                    id: currentUserId,
                                                    avatarUrl: currentUserAvatar,
                                                    name: currentUserName,
                                                  }]
                                                : [{
                                                    id: currentUserId,
                                                    avatarUrl: currentUserAvatar,
                                                    name: currentUserName,
                                                  }],
                                            },
                                          };
                                        }
                                      });
                                      setEmojiPickerMessageId(null);
                                      setHoveredMessageId(null);
                                    }}
                                    defaultEmoji={typeof window !== "undefined" ? localStorage.getItem("lastSelectedEmoji") || "❤️" : "❤️"}
                                  />
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                setForwardingMessage(message);
                                setShowForwardModal(true);
                                setHoveredMessageId(null);
                              }}
                              onTouchEnd={(e) => {
                                e.preventDefault();
                                setForwardingMessage(message);
                                setShowForwardModal(true);
                                setHoveredMessageId(null);
                              }}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 rounded transition-colors touch-manipulation"
                              title="Переслать"
                            >
                              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}

                      {/* Редактирование сообщения */}
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editMessageText}
                            onChange={(e) => setEditMessageText(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                            rows={3}
                            placeholder="Введите текст сообщения..."
                          />
                          
                          {/* Текущие вложения */}
                          {message.attachments && message.attachments.length > 0 && !editMessageFile && (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Текущие вложения:</p>
                              {message.attachments.map((attachment) => {
                                // Проверяем тип по mimeType или type, а не по originalName
                                // (originalName может быть .heic, но файл уже конвертирован в JPEG)
                                const isImage = attachment.type === "image" || 
                                  attachment.mimeType?.startsWith("image/") ||
                                  attachment.fileName.toLowerCase().endsWith(".jpg") ||
                                  attachment.fileName.toLowerCase().endsWith(".jpeg") ||
                                  attachment.fileName.toLowerCase().endsWith(".png") ||
                                  attachment.fileName.toLowerCase().endsWith(".gif") ||
                                  attachment.fileName.toLowerCase().endsWith(".webp");
                                
                                return (
                                  <div key={attachment.id} className="relative">
                                    {isImage ? (
                                      <div className="relative">
                                        <img
                                          src={getFileUrl(attachment.filePath)}
                                          alt={attachment.originalName}
                                          className="max-w-full max-h-32 rounded-lg object-contain border border-gray-200 dark:border-gray-600"
                                        />
                                        <button
                                          onClick={() => editMessageFileInputRef.current?.click()}
                                          className="absolute top-2 right-2 p-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors text-xs"
                                          title="Заменить"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                          </svg>
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                                        <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-gray-700 dark:text-gray-300 truncate flex-1 text-xs">
                                          {attachment.originalName}
                                        </span>
                                        <button
                                          onClick={() => editMessageFileInputRef.current?.click()}
                                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-xs"
                                          title="Заменить"
                                        >
                                          Заменить
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Новый файл для замены */}
                          {editMessageFile && (
                            <div className="space-y-2">
                              <p className="text-xs text-gray-500 dark:text-gray-400">Новое вложение:</p>
                              {editMessageFilePreview ? (
                                <div className="relative">
                                  <img
                                    src={editMessageFilePreview}
                                    alt={editMessageFile.name}
                                    className="max-w-full max-h-32 rounded-lg object-contain border border-gray-200 dark:border-gray-600"
                                  />
                                  <button
                                    onClick={() => {
                                      if (editMessageFilePreview) {
                                        URL.revokeObjectURL(editMessageFilePreview);
                                      }
                                      setEditMessageFile(null);
                                      setEditMessageFilePreview(null);
                                      if (editMessageFileInputRef.current) {
                                        editMessageFileInputRef.current.value = "";
                                      }
                                    }}
                                    className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded text-sm">
                                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1 text-xs">
                                    {editMessageFile.name}
                                  </span>
                                  <button
                                    onClick={() => {
                                      if (editMessageFilePreview) {
                                        URL.revokeObjectURL(editMessageFilePreview);
                                      }
                                      setEditMessageFile(null);
                                      setEditMessageFilePreview(null);
                                      if (editMessageFileInputRef.current) {
                                        editMessageFileInputRef.current.value = "";
                                      }
                                    }}
                                    className="text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-xs"
                                  >
                                    ✕
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Кнопка для добавления/замены файла */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => editMessageFileInputRef.current?.click()}
                              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                              </svg>
                              {message.attachments && message.attachments.length > 0 ? "Заменить файл" : "Прикрепить файл"}
                            </button>
                          </div>

                          <input
                            type="file"
                            ref={editMessageFileInputRef}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setEditMessageFile(file);
                                
                                // Создаем превью для изображений (кроме HEIC)
                                const isHeic = file.name.toLowerCase().endsWith('.heic') || 
                                               file.name.toLowerCase().endsWith('.heif') ||
                                               file.type === 'image/heic' ||
                                               file.type === 'image/heif';
                                
                                if (file.type.startsWith("image/") && !isHeic) {
                                  setEditMessageFilePreview(URL.createObjectURL(file));
                                } else {
                                  setEditMessageFilePreview(null);
                                }
                              }
                            }}
                            className="hidden"
                            accept="image/*,video/*,.pdf,.doc,.docx,.txt,.heic,.heif"
                          />

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => {
                                if (editMessageFilePreview) {
                                  URL.revokeObjectURL(editMessageFilePreview);
                                }
                                setEditingMessageId(null);
                                setEditMessageText("");
                                setEditMessageFile(null);
                                setEditMessageFilePreview(null);
                                if (editMessageFileInputRef.current) {
                                  editMessageFileInputRef.current.value = "";
                                }
                              }}
                              className="px-3 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                            >
                              Отмена
                            </button>
                            <button
                              onClick={() => handleEditMessage(message.id)}
                              disabled={!editMessageText.trim() && !editMessageFile}
                              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Сохранить
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Пересланное сообщение */}
                          {message.forwardedFrom && (
                            <div className={`mb-2 p-2 rounded border-l-2 ${isOwn ? "border-purple-300 bg-purple-500/20" : "border-purple-400 bg-purple-300/20 dark:bg-purple-600/20"}`}>
                              <div className="flex items-center gap-1 mb-1">
                                <svg className="w-3 h-3 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                                <p className="text-xs font-semibold opacity-75">
                                  Переслано от {getUserName(message.forwardedFrom.sender)}
                                </p>
                              </div>
                              <p className="text-xs opacity-60 truncate">
                                {message.forwardedFrom.content.substring(0, 50)}
                                {message.forwardedFrom.content.length > 50 ? "..." : ""}
                              </p>
                            </div>
                          )}

                          {/* Ответ на сообщение */}
                          {message.replyTo && (
                            <div className={`mb-2 p-2 rounded border-l-2 ${isOwn ? "border-blue-300 bg-blue-500/20" : "border-gray-400 bg-gray-300/20 dark:bg-gray-600/20"}`}>
                              <p className="text-xs font-semibold opacity-75">
                                {getUserName(message.replyTo.sender)}
                              </p>
                              <p className="text-xs opacity-60 truncate">
                                {message.replyTo.content.substring(0, 50)}
                                {message.replyTo.content.length > 50 ? "..." : ""}
                              </p>
                            </div>
                          )}

                          {/* Вложения */}
                          {message.attachments && message.attachments.length > 0 && (
                            <div className="mb-2 space-y-2">
                              {message.attachments.map((attachment) => {
                                // Проверяем тип по mimeType или type, а не по originalName
                                // (originalName может быть .heic, но файл уже конвертирован в JPEG)
                                const isImage = attachment.type === "image" || 
                                  attachment.mimeType?.startsWith("image/") ||
                                  attachment.fileName.toLowerCase().endsWith(".jpg") ||
                                  attachment.fileName.toLowerCase().endsWith(".jpeg") ||
                                  attachment.fileName.toLowerCase().endsWith(".png") ||
                                  attachment.fileName.toLowerCase().endsWith(".gif") ||
                                  attachment.fileName.toLowerCase().endsWith(".webp");
                                
                                return (
                                  <div key={attachment.id} className="relative">
                                    {isImage ? (
                                      <div className="relative group">
                                        <img
                                          src={getFileUrl(attachment.filePath)}
                                          alt={attachment.originalName}
                                          className="max-w-full max-h-64 rounded-lg cursor-pointer object-contain border border-gray-200 dark:border-gray-600 hover:opacity-90 transition-opacity"
                                          onClick={() => setSelectedImage({ url: getFileUrl(attachment.filePath), name: attachment.originalName })}
                                          onError={(e) => {
                                            const target = e.target as HTMLImageElement;
                                            target.style.display = "none";
                                            const fallback = target.nextElementSibling as HTMLElement;
                                            if (fallback) {
                                              fallback.style.display = "flex";
                                            }
                                          }}
                                        />
                                        <div className="hidden absolute inset-0 bg-gray-100 dark:bg-gray-800 rounded-lg items-center justify-center">
                                          <div className="text-center p-4">
                                            <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                              {attachment.originalName}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                    ) : (
                                      <a
                                        href={getFileUrl(attachment.filePath)}
                                        download={attachment.originalName}
                                        className="flex items-center gap-2 p-2 bg-white/10 dark:bg-gray-800/50 rounded hover:bg-white/20 dark:hover:bg-gray-800/70 transition-colors"
                                      >
                                        <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs truncate">{attachment.originalName}</p>
                                          <p className="text-xs opacity-75">
                                            {(attachment.fileSize / 1024).toFixed(1)} KB
                                          </p>
                                        </div>
                                        <svg className="w-4 h-4 flex-shrink-0 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                      </a>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {message.content ? (
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {message.content.split(/(https?:\/\/[^\s]+)/g).map((part, index) => {
                                if (part.match(/^https?:\/\//)) {
                                  return (
                                    <a
                                      key={index}
                                      href={part}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-blue-400 hover:text-blue-300 underline break-all"
                                    >
                                      {part}
                                    </a>
                                  );
                                }
                                return <span key={index}>{part}</span>;
                              })}
                            </p>
                          ) : null}
                          {/* Реакции на сообщение */}
                          {messageLikes[message.id] && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap">
                              <button
                                onClick={() => {
                                  // TODO: Удалить реакцию
                                  setMessageLikes(prev => {
                                    const newLikes = { ...prev };
                                    if (newLikes[message.id].count > 1) {
                                      newLikes[message.id] = {
                                        ...newLikes[message.id],
                                        count: newLikes[message.id].count - 1,
                                        isLiked: false,
                                      };
                                    } else {
                                      delete newLikes[message.id];
                                    }
                                    return newLikes;
                                  });
                                }}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full transition-colors ${
                                  messageLikes[message.id].isLiked
                                    ? "bg-blue-500/20 dark:bg-blue-500/30 border border-blue-500/50"
                                    : "bg-white/10 dark:bg-gray-700/50 hover:bg-white/20 dark:hover:bg-gray-700/70"
                                }`}
                              >
                                <span className="text-sm">{messageLikes[message.id].emoji}</span>
                                {messageLikes[message.id].count > 1 && (
                                  <span className="text-xs">{messageLikes[message.id].count}</span>
                                )}
                                {messageLikes[message.id].isLiked && messageLikes[message.id].users && messageLikes[message.id].users![0] && (
                                  <div className="flex items-center -ml-1">
                                    {messageLikes[message.id].users!.slice(0, 3).map((user, idx) => (
                                      <div
                                        key={user.id}
                                        className="w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 overflow-hidden"
                                        style={{ marginLeft: idx > 0 ? '-4px' : '0' }}
                                      >
                                        {user.avatarUrl && !avatarLoadErrors.has(`${message.id}-${user.id}`) ? (
                                          <img
                                            src={getFileUrl(user.avatarUrl)}
                                            alt={user.name}
                                            className="w-full h-full object-cover"
                                            onError={() => {
                                              // Если изображение не загрузилось, добавляем в список ошибок
                                              setAvatarLoadErrors(prev => new Set(prev).add(`${message.id}-${user.id}`));
                                            }}
                                          />
                                        ) : (
                                          <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-[8px] font-semibold">
                                            {user.name.charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mt-1">
                            <p
                              className={`text-xs ${
                          isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                              {mounted ? formatTime(message.createdAt) : ""}
                            </p>
                            {message.editedAt && (
                              <span className={`text-xs italic ${isOwn ? "text-blue-100" : "text-gray-500 dark:text-gray-400"}`}>
                                (изменено)
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Поле ввода */}
            <div className="p-3 md:p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {/* Ответ на сообщение */}
              {replyingToMessage && (
                <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 rounded flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                      Ответ на: {getUserName(replyingToMessage.sender)}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 truncate">
                      {replyingToMessage.content.substring(0, 100)}
                      {replyingToMessage.content.length > 100 ? "..." : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => setReplyingToMessage(null)}
                    className="ml-2 p-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {/* Индикатор конвертации HEIC */}
              {isConvertingHeic && (
                <div className="mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-300 text-center">
                    Конвертация HEIC изображения...
                  </p>
                </div>
              )}
              {/* Выбранный файл */}
              {selectedFile && !isConvertingHeic && (
                <div className="mb-2">
                  {filePreview ? (
                    <div className="relative">
                      <img
                        src={filePreview}
                        alt={selectedFile.name}
                        className="w-full max-h-64 object-contain rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                      <button
                        onClick={() => {
                          if (filePreview) {
                            URL.revokeObjectURL(filePreview);
                          }
                          setSelectedFile(null);
                          setFilePreview(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                        className="absolute top-2 right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                      <svg className="w-5 h-5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                        {selectedFile.name}
                      </span>
                      <button
                        onClick={() => {
                          if (filePreview) {
                            URL.revokeObjectURL(filePreview);
                          }
                          setSelectedFile(null);
                          setFilePreview(null);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}
              <div className="flex gap-2 items-end">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  className="hidden"
                  accept="image/*,video/*,.pdf,.doc,.docx,.txt,.heic,.heif"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                  title="Прикрепить файл"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    placeholder="Введите сообщение..."
                    rows={1}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm md:text-base resize-none overflow-hidden leading-normal"
                    style={{ minHeight: "44px", maxHeight: "150px" }}
                  />
                  <div className="absolute left-2 flex items-center" style={{ top: "10px", height: "24px" }}>
                    <EmojiPicker
                      onEmojiSelect={(emoji) => {
                        setMessageText((prev) => prev + emoji);
                        if (textareaRef.current) {
                          textareaRef.current.focus();
                        }
                      }}
                      defaultEmoji={typeof window !== "undefined" ? localStorage.getItem("lastSelectedEmoji") || "❤️" : "❤️"}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    sendMessage();
                    // Сбрасываем высоту textarea после отправки
                    if (textareaRef.current) {
                      textareaRef.current.style.height = "44px";
                    }
                  }}
                  disabled={(!messageText.trim() && !selectedFile) || sending}
                  className="px-4 md:px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm md:text-base flex-shrink-0"
                >
                  <span className="hidden md:inline">Отправить</span>
                  <svg className="md:hidden w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <svg
                className="w-16 h-16 mx-auto mb-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              <p className="text-lg font-medium">Выберите чат или начните новый</p>
            </div>
          </div>
        )}

        {/* Модальное окно для пересылки сообщения */}
        {showForwardModal && forwardingMessage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/70 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
              {/* Заголовок */}
              <div className="p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg lg:text-xl font-semibold text-gray-900 dark:text-white">
                    Переслать сообщение
                  </h3>
                  <button
                    onClick={() => {
                      setShowForwardModal(false);
                      setForwardingMessage(null);
                      setForwardSearchQuery("");
                      setForwardUsers([]);
                    }}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Превью пересылаемого сообщения */}
              <div className="p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Пересылаемое сообщение:</p>
                <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
                    {forwardingMessage.content}
                  </p>
                </div>
              </div>

              {/* Поиск пользователей */}
              <div className="p-4 lg:p-6 border-b border-gray-200 dark:border-gray-700">
                <input
                  type="text"
                  value={forwardSearchQuery}
                  onChange={(e) => {
                    setForwardSearchQuery(e.target.value);
                    searchUsersForForward(e.target.value);
                  }}
                  placeholder="Поиск по имени или телефону..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Список пользователей */}
              <div className="flex-1 overflow-y-auto p-4 lg:p-6">
                {forwardLoading ? (
                  <div className="text-center py-8">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-blue-500 border-r-transparent"></div>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Поиск...</p>
                  </div>
                ) : forwardUsers.length > 0 ? (
                  <div className="space-y-2">
                    {forwardUsers.map((user) => {
                      const userName = [user.firstName, user.middleName, user.lastName]
                        .filter(Boolean)
                        .join(" ") || "Пользователь";
                      
                      return (
                        <button
                          key={user.id}
                          onClick={() => handleForwardMessage(user.id)}
                          className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                        >
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={userName}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                              {user.firstName?.[0] || user.lastName?.[0] || "?"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate">
                              {userName}
                            </p>
                            {user.phone && (
                              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                                {user.phone}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                ) : forwardSearchQuery ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">Пользователи не найдены</p>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 dark:text-gray-400">
                      Введите имя или телефон для поиска
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно для просмотра изображений */}
      {selectedImage && (
        <ImageModal
          isOpen={!!selectedImage}
          imageUrl={selectedImage.url}
          imageName={selectedImage.name}
          onClose={() => setSelectedImage(null)}
        />
      )}

      {/* AlertDialog для подтверждения удаления и других сообщений */}
      <AlertDialog
        isOpen={alertDialog.isOpen}
        title={alertDialog.title}
        message={alertDialog.message}
        type={alertDialog.type}
        onConfirm={alertDialog.onConfirm}
        onCancel={alertDialog.onCancel}
      />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex h-[calc(100vh-8rem)] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка чата...</p>
        </div>
      </div>
    }>
      <ChatPageContent />
    </Suspense>
  );
}

