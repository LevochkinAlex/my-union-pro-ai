import { appConfig } from "../config/appConfig";

export type ChannelPostJson = {
  type: "channel_post";
  postId: string;
  title?: string;
  content?: string;
  coverImage?: string | null;
  hasPolls?: boolean;
  forwarded?: boolean;
  channelId?: string;
  channelName?: string;
  originalChatId?: string;
  polls?: unknown[];
};

export function parseChannelPostJson(content: string): ChannelPostJson | null {
  const raw = typeof content === "string" ? content.trim() : "";
  if (!raw.startsWith("{")) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.type !== "channel_post" || typeof parsed.postId !== "string" || !parsed.postId) {
      return null;
    }
    return parsed as unknown as ChannelPostJson;
  } catch {
    return null;
  }
}

/** Достаём пост из сообщения (в т.ч. если в БД messageType = text, а content — JSON поста). */
export function getChannelPostFromMessage(content: string, _messageType: string): ChannelPostJson | null {
  return parseChannelPostJson(content);
}

export function resolveChannelMediaUrl(path: string | null | undefined): string | null {
  if (!path || typeof path !== "string") return null;
  const p = path.trim();
  if (!p) return null;
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const base = appConfig.apiBaseUrl.replace(/\/$/, "");
  if (p.startsWith("/")) return `${base}${p}`;
  return `${base}/${p}`;
}

export function channelPostOpenUrl(postId: string): string {
  const base = appConfig.webAppUrl.replace(/\/$/, "");
  return `${base}/dashboard/news/${postId}`;
}

/** Короткая подпись для превью ответа (не показывать сырой JSON). */
export function formatReplySnippet(content: string): string {
  const post = parseChannelPostJson(content);
  if (post?.title) return post.title;
  return content;
}
