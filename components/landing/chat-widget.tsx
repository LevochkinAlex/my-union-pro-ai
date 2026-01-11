"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { MessageCircle, X, Send, Bot, User } from "lucide-react"

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Здравствуйте! Я AI-ассистент MyUnion Pro. Задайте мне вопрос о платформе, тарифах или функциях.",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    try {
      const response = await fetch("/api/landing/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      })

      if (!response.ok) throw new Error("Failed to fetch")

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      }
      setMessages((prev) => [...prev, assistantMessage])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("0:")) {
            try {
              const content = JSON.parse(line.slice(2))
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMessage.id ? { ...m, content: m.content + content } : m)),
              )
            } catch {
              // Skip parsing errors
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "Извините, произошла ошибка. Попробуйте позже или свяжитесь с нами напрямую.",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-foreground/90 text-background shadow-lg backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-foreground ${
          isOpen ? "rotate-180" : ""
        }`}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Window */}
      <div
        className={`fixed bottom-24 right-6 z-[60] w-[360px] overflow-hidden rounded-2xl border border-foreground/10 bg-background/95 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        }`}
      >
        {/* Header */}
        <div className="border-b border-foreground/10 bg-foreground/5 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-foreground/10">
              <Bot className="h-4 w-4 text-foreground" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground">MyUnion AI</h3>
              <p className="text-xs text-foreground/60">Онлайн</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4">
          <div className="space-y-4">
            {messages.map((message) => (
              <div key={message.id} className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                    message.role === "user" ? "bg-foreground/20" : "bg-foreground/10"
                  }`}
                >
                  {message.role === "user" ? (
                    <User className="h-3 w-3 text-foreground" />
                  ) : (
                    <Bot className="h-3 w-3 text-foreground" />
                  )}
                </div>
                <div
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    message.role === "user" ? "bg-foreground/20 text-foreground" : "bg-foreground/5 text-foreground/90"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10">
                  <Bot className="h-3 w-3 text-foreground" />
                </div>
                <div className="flex items-center gap-1 rounded-xl bg-foreground/5 px-3 py-2">
                  <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/40" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:0.1s]" />
                  <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/40 [animation-delay:0.2s]" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="border-t border-foreground/10 p-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Задайте вопрос..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-foreground/10 bg-foreground/5 px-4 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-foreground/20 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-foreground/90 text-background transition-all hover:bg-foreground disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
