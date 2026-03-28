/** Ответ GET /api/chat — элемент списка (как в веб-клиенте). */
export type MobileChat = {
  id: string;
  type: "PRIVATE" | "GROUP" | "CHANNEL";
  name: string | null;
  displayName: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
  archivedAt: string | null;
  ticketId?: string | null;
  ticketPublicId?: string | null;
  meetingId?: string | null;
  newsChannelOrganizationId?: string | null;
  isAIChat?: boolean;
  isSupportChat?: boolean;
  unreadCount?: number;
  ticket?: { id: string; publicId?: string | null } | null;
  otherUser: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName?: string | null;
    avatarUrl: string | null;
  } | null;
};

export type ChatMessageItem = {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  messageType: string;
  createdAt: string;
  sender: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    middleName?: string | null;
    avatarUrl: string | null;
  };
};
