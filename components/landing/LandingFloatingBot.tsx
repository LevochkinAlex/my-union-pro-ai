"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import FloatingChatBot from "@/components/common/FloatingChatBot";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  id?: string;
}

/**
 * На лендинге: для гостей — полноценный чат с ботом (диалог, сбор имени/телефона, предложение демо и регистрации).
 * Для авторизованных — обычный FloatingChatBot.
 */
export default function LandingFloatingBot() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [initialRequestDone, setInitialRequestDone] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = input.trim().length > 0 && !isLoading;

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + "px";
  }, [input]);

  // При первом открытии чата запрашиваем приветствие у бота
  useEffect(() => {
    if (status !== "authenticated" && open && messages.length === 0 && !isLoading && !initialRequestDone) {
      setInitialRequestDone(true);
      setIsLoading(true);
      fetch("/api/landing-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Начало диалога", history: [] }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.message) {
            setMessages([
              {
                role: "assistant",
                content: data.message,
                timestamp: Date.now(),
                id: `welcome-${Date.now()}`,
              },
            ]);
          }
        })
        .catch(() => {
          setMessages([
            {
              role: "assistant",
              content: "Здравствуйте! Я помощник MyUnion Pro. Расскажите, вы председатель профсоюзной организации, член профсоюза или интересуетесь платформой? Подскажу, как лучше попробовать демо.",
              timestamp: Date.now(),
              id: `fallback-${Date.now()}`,
            },
          ]);
        })
        .finally(() => setIsLoading(false));
    }
  }, [open, messages.length, isLoading, initialRequestDone, status]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSend) return;
      const text = input.trim();
      setInput("");
      const userMsg: ChatMessage = {
        role: "user",
        content: text,
        timestamp: Date.now(),
        id: `user-${Date.now()}`,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);

      const history = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

      fetch("/api/landing-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "Не удалось отправить сообщение. Попробуйте ещё раз.",
                timestamp: Date.now(),
              },
            ]);
            return;
          }
          if (data.message) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: data.message,
                timestamp: Date.now(),
                id: `ai-${Date.now()}`,
              },
            ]);
          }
        })
        .catch(() => {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "Ошибка связи. Попробуйте позже.",
              timestamp: Date.now(),
            },
          ]);
        })
        .finally(() => setIsLoading(false));
    },
    [canSend, input, messages]
  );

  if (status === "loading") {
    return null;
  }

  if (session?.user?.id) {
    return <FloatingChatBot />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-blue-600 shadow-lg transition-all hover:from-purple-600 hover:to-blue-700 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:from-purple-600 dark:to-blue-700 dark:hover:from-purple-700 dark:hover:to-blue-800"
        aria-label="ИИ-помощник"
      >
        <img src="/icon-512x512.png" alt="AI" className="h-7 w-7 rounded-full object-cover" />
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[520px] w-[380px] flex-col rounded-xl border border-border bg-card shadow-2xl">
          <div className="flex items-center justify-between rounded-t-xl bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 overflow-hidden rounded-full bg-primary-foreground/20">
                <img src="/icon-512x512.png" alt="" className="h-full w-full object-cover" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">ИИ-помощник</h3>
                <p className="text-xs text-primary-foreground/80">MyUnion Pro</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-primary-foreground/80 hover:text-primary-foreground"
              aria-label="Закрыть"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {messages.length === 0 && !isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Загрузка…
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((msg, i) => (
                  <div
                    key={msg.id ?? i}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary/20">
                        <img src="/icon-512x512.png" alt="" className="h-full w-full object-cover" />
                      </div>
                    )}
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-md"
                          : "bg-muted text-foreground rounded-bl-md"
                      }`}
                    >
                      {msg.role === "user" ? (
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="my-1">{children}</p>,
                              ul: ({ children }) => <ul className="my-1 list-disc pl-4">{children}</ul>,
                              ol: ({ children }) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
                              li: ({ children }) => <li className="my-0.5">{children}</li>,
                              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {isLoading && (
                  <div className="flex justify-start gap-2">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-primary/20">
                      <img src="/icon-512x512.png" alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="rounded-2xl rounded-bl-md bg-muted px-4 py-3">
                      <div className="flex gap-1">
                        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "0ms" }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "150ms" }} />
                        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border p-3">
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Напишите сообщение..."
                rows={1}
                className="min-h-[40px] max-h-[120px] flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={!canSend}
                className="shrink-0 rounded-lg bg-primary p-2 text-primary-foreground hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Отправить"
              >
                {isLoading ? (
                  <span className="block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
