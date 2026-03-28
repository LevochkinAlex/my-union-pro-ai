import type { MobileChat } from "../types/chat";

export type SidebarTab = "all" | "work" | "personal" | "archived";

export function getChatDisplayName(chat: MobileChat, currentUserId: string | null): string {
  if (chat.type === "GROUP" || chat.type === "CHANNEL") {
    const name = chat.displayName || chat.name || (chat.type === "CHANNEL" ? "Канал" : "Групповой чат");
    return name === "Основной" ? chat.displayName || "Канал организации" : name;
  }
  if (chat.otherUser) {
    const parts = [chat.otherUser.lastName, chat.otherUser.firstName].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Пользователь";
  }
  return "Чат";
}

function isChannelChat(chat: MobileChat): boolean {
  return chat.type === "CHANNEL";
}

function isAIChat(chat: MobileChat): boolean {
  if (chat.isAIChat === true) return true;
  if (chat.otherUser?.id) {
    const id = chat.otherUser.id.toLowerCase();
    if (
      id.includes("ai-assistant") ||
      id.includes("bot") ||
      id === "ai-assistant-bot" ||
      (id.includes("ai") && id.includes("assistant"))
    ) {
      return true;
    }
  }
  if (chat.name) {
    const n = chat.name.toLowerCase();
    const patterns = ["ии-ассистент", "ии ассистент", "ai assistant", "ai-assistant", "помощник ai", "ai помощник", "ai-помощник"];
    if (patterns.some((p) => n.includes(p))) return true;
  }
  return false;
}

function isSupportChat(chat: MobileChat): boolean {
  if (chat.isSupportChat === true) return true;
  const name = chat.displayName || chat.name || "";
  return name === "Техподдержка" || name.toLowerCase().includes("техподдерж");
}

export function categorizeChats(
  chats: MobileChat[],
  searchQuery: string,
  currentUserId: string | null,
): {
  workChats: MobileChat[];
  personalChats: MobileChat[];
  channels: MobileChat[];
  archivedChats: MobileChat[];
  aiChat: MobileChat | null;
  supportChat: MobileChat | null;
} {
  let filtered = searchQuery
    ? chats.filter((chat) => {
        const name = getChatDisplayName(chat, currentUserId);
        return name.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : chats;

  const work: MobileChat[] = [];
  const personal: MobileChat[] = [];
  const channelList: MobileChat[] = [];
  const archived: MobileChat[] = [];
  let ai: MobileChat | null = null;
  let support: MobileChat | null = null;

  for (const chat of filtered) {
    if (isAIChat(chat)) {
      if (!ai) ai = chat;
      continue;
    }
    if (isSupportChat(chat)) {
      if (!support) support = chat;
      continue;
    }

    if (chat.archivedAt) {
      archived.push(chat);
      continue;
    }

    if (isChannelChat(chat)) {
      channelList.push(chat);
      continue;
    }

    const hasTicket = !!(
      chat.ticketId ||
      chat.ticketPublicId ||
      chat.ticket?.id ||
      chat.ticket?.publicId
    );
    const isMeetingChat = !!chat.meetingId;

    if (hasTicket || isMeetingChat) {
      work.push(chat);
    } else if (chat.type === "PRIVATE") {
      personal.push(chat);
    } else {
      personal.push(chat);
    }
  }

  return {
    workChats: work,
    personalChats: personal,
    channels: channelList,
    archivedChats: archived,
    aiChat: ai,
    supportChat: support,
  };
}

export function displayedChatsForTab(
  tab: SidebarTab,
  buckets: ReturnType<typeof categorizeChats>,
): {
  work: MobileChat[];
  personal: MobileChat[];
  channels: MobileChat[];
  archived: MobileChat[];
  ai: MobileChat | null;
  support: MobileChat | null;
} {
  const { workChats, personalChats, channels, archivedChats, aiChat, supportChat } = buckets;
  switch (tab) {
    case "work":
      return { work: workChats, personal: [], channels, archived: [], ai: aiChat, support: supportChat };
    case "personal":
      return { work: [], personal: personalChats, channels: [], archived: [], ai: aiChat, support: supportChat };
    case "archived":
      return { work: [], personal: [], channels: [], archived: archivedChats, ai: aiChat, support: supportChat };
    default:
      return {
        work: workChats,
        personal: personalChats,
        channels,
        archived: archivedChats,
        ai: aiChat,
        support: supportChat,
      };
  }
}

export function isChairmanViewMode(currentMode: string | undefined): boolean {
  return currentMode === "PPO_HEAD" || currentMode === "MPO_HEAD" || currentMode === "RPO_HEAD";
}
