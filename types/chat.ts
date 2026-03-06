// Типы для чата

export interface ChatUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  avatarUrl: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  profession?: string | null;
  organization?: {
    id: string;
    name: string;
  } | null;
  /** Собеседник удалён; показывать плейсхолдер и не открывать профиль */
  isDeleted?: boolean;
}

export interface Chat {
  id: string;
  type?: "PRIVATE" | "GROUP" | "CHANNEL";
  otherUser: ChatUser;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt?: Date | string | null;
  createdById?: string | null;
  /** Дата архивации чата (null если не архивирован) */
  archivedAt?: Date | string | null;
  // Group-specific fields
  name?: string | null;
  description?: string | null;
  iconUrl?: string | null;
  isPublic?: boolean;
  participants?: Array<{
    id: string;
    userId: string;
    user: ChatUser;
    role?: string;
  }>;
  participantsCount?: number;
  _count?: {
    participants?: number;
    messages?: number;
  };
  /** Чат заседания — участников можно добавлять только через повестку/протокол в разделе «Документы» */
  meetingId?: string | null;
  /** Организация канала (null = региональный). Для РПО: canPost только у регионального канала */
  newsChannelOrganizationId?: string | null;
  /** Для каналов у РПО: true только у «Региональные новости», остальные — только просмотр */
  canPost?: boolean;
  // Ticket-related fields (for appeal chats)
  ticketId?: string | null;
  ticketPublicId?: string | null;
  ticketTitle?: string | null;
  ticket?: {
    id: string;
    publicId: string;
    title: string;
    status: string;
    userId: string;
    organizationId?: string | null;
    type?: string;
    priority?: string;
    createdAt?: string;
    user?: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      middleName: string | null;
      avatarUrl: string | null;
      email: string;
    };
    organization?: {
      id: string;
      name: string;
    };
  } | null;
}

export interface MessageAttachment {
  id: string;
  type: string;
  fileName: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  chatId?: string; // ID чата, к которому относится сообщение
  messageType: string; // Добавлено для совместимости
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToId?: string | null;
  replyTo?: Message | null;
  forwardedFromId?: string | null;
  forwardedFrom?: Message | null;
  reactions?: Record<string, { userIds: string[]; users?: ReactionUser[] }> | null;
  sender: ChatUser;
  attachments?: MessageAttachment[];
  /** 0–100, только для оптимистичного сообщения с файлом во время загрузки */
  uploadProgress?: number;
}

export interface ReactionUser {
  id: string;
  avatarUrl: string | null;
  name: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  isLiked: boolean;
  users?: ReactionUser[];
}

export interface ChatState {
  chats: Chat[];
  selectedChat: Chat | null;
  messages: Message[];
  loading: boolean;
  sending: boolean;
  hasMoreMessages: boolean;
  oldestMessageId: string | null;
}

