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
}

export interface Chat {
  id: string;
  type?: "PRIVATE" | "GROUP";
  otherUser: ChatUser;
  lastMessage: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  createdAt?: Date | string | null;
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
  // Ticket-related fields (for appeal chats)
  ticketId?: string | null;
  ticketPublicId?: string | null;
  ticketTitle?: string | null;
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

