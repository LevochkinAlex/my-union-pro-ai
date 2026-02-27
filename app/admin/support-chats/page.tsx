"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Headset, ArrowLeft, Send, User, MessageSquare } from "lucide-react";

type SupportChatItem = {
  chatId: string;
  lastMessageAt: string;
  lastMessagePreview: string;
  lastMessageSenderId: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

type Message = {
  id: string;
  content: string;
  messageType: string;
  createdAt: string;
  senderId: string;
  sender: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
};

export default function AdminSupportChatsPage() {
  const [chats, setChats] = useState<SupportChatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [client, setClient] = useState<{ id: string; firstName: string | null; lastName: string | null; email: string | null; avatarUrl: string | null } | null>(null);
  const [supportUserId, setSupportUserId] = useState<string | null>(null);
  const [messageLoading, setMessageLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const loadChats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/support-chats");
      const data = await res.json();
      if (res.ok && data.chats) setChats(data.chats);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
  }, [loadChats]);

  const loadConversation = useCallback(async (chatId: string) => {
    setSelectedChatId(chatId);
    setMessageLoading(true);
    setMessages([]);
    setClient(null);
    try {
      const res = await fetch(`/api/admin/support-chats/${chatId}`);
      const data = await res.json();
      if (!res.ok) {
        setSelectedChatId(null);
        return;
      }
      setMessages(data.messages ?? []);
      setClient(data.client ?? null);
      setSupportUserId(data.supportUserId ?? null);
    } finally {
      setMessageLoading(false);
    }
  }, []);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !selectedChatId || sending) return;
    setSending(true);
    setInput("");
    try {
      const res = await fetch(`/api/admin/support-chats/${selectedChatId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setMessages((prev) => [...prev, data.message]);
      }
    } finally {
      setSending(false);
    }
  };

  const displayName = (u: SupportChatItem["user"]) =>
    u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || "Пользователь" : "—";

  return (
    <div className="space-y-6 min-w-0 w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/admin"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200 transition-colors"
            aria-label="Назад"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-200/50 dark:bg-blue-800/40">
              <Headset className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Чаты техподдержки
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Только диалоги, в которых есть сообщения. Боты и пустые чаты не показываются.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)] min-h-[420px]">
        {/* Список чатов */}
        <div className="w-full lg:w-96 flex-shrink-0 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm flex flex-col">
          <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Диалоги</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Выберите чат, чтобы просмотреть переписку и ответить
            </p>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <span className="mt-2 text-sm">Загрузка…</span>
              </div>
            ) : chats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                <MessageSquare className="h-10 w-10 opacity-50" />
                <span className="mt-2 text-sm">Нет диалогов с сообщениями</span>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                {chats.map((c) => (
                  <li key={c.chatId}>
                    <button
                      type="button"
                      onClick={() => loadConversation(c.chatId)}
                      className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                        selectedChatId === c.chatId
                          ? "bg-blue-50 dark:bg-blue-950/40 border-l-4 border-l-blue-500"
                          : ""
                      }`}
                    >
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {displayName(c.user)}
                      </div>
                      {c.user?.email && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                          {c.user.email}
                        </div>
                      )}
                      {c.lastMessagePreview && (
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate mt-1">
                          {c.lastMessagePreview}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                        {c.lastMessageAt
                          ? new Date(c.lastMessageAt).toLocaleString("ru", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Окно переписки */}
        <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          {!selectedChatId ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-500 dark:text-gray-400 p-8">
              <MessageSquare className="h-12 w-12 opacity-40 mb-3" />
              <p className="text-sm font-medium">Выберите чат из списка слева</p>
              <p className="text-xs mt-1">Здесь отобразятся сообщения и поле для ответа</p>
            </div>
          ) : messageLoading ? (
            <div className="flex flex-1 items-center justify-center text-gray-500 dark:text-gray-400">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <span className="text-sm">Загрузка переписки…</span>
              </div>
            </div>
          ) : (
            <>
              <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 bg-gray-50 dark:bg-gray-900/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-200/50 dark:bg-blue-800/40">
                  <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-gray-900 dark:text-white truncate">
                    {client
                      ? [client.firstName, client.lastName].filter(Boolean).join(" ") || "Клиент"
                      : "Клиент"}
                  </div>
                  {client?.email && (
                    <div className="text-sm text-gray-600 dark:text-gray-400 truncate">{client.email}</div>
                  )}
                </div>
                {client?.id && (
                  <Link
                    href={`/admin/users/${client.id}`}
                    className="shrink-0 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Профиль
                  </Link>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map((m) => {
                  const isSupport = m.senderId === supportUserId;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isSupport ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                          isSupport
                            ? "rounded-br-md bg-blue-600 text-white dark:bg-blue-500"
                            : "rounded-bl-md bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                        }`}
                      >
                        <div className="text-xs opacity-90 mb-1">
                          {isSupport
                            ? "Техподдержка"
                            : m.sender
                              ? [m.sender.firstName, m.sender.lastName].filter(Boolean).join(" ") || "Клиент"
                              : "Клиент"}
                        </div>
                        <div className="whitespace-pre-wrap break-words">{m.content}</div>
                        <div className="text-xs opacity-75 mt-1.5">
                          {new Date(m.createdAt).toLocaleString("ru", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex gap-2 bg-gray-50 dark:bg-gray-900/50">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Сообщение от имени техподдержки…"
                  className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                  disabled={sending}
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!input.trim() || sending}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Отправить
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
