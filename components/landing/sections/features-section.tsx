"use client"

import { useReveal } from "@/hooks/use-reveal"
import { Bot, FileText, Users, Shield, Bell, MessageCircle, Building2, CreditCard } from "lucide-react"

export function FeaturesSection() {
  const { ref, isVisible } = useReveal(0.3)

  const features = [
    {
      icon: Bot,
      title: "AI-ассистент",
      description: "Чат-бот на базе GPT-4 обрабатывает 80% обращений автоматически. RAG-система с базой знаний.",
      direction: "top",
    },
    {
      icon: FileText,
      title: "Документооборот",
      description: "Автоматическая генерация PDF документов по шаблонам. Заявления, справки, формы взносов.",
      direction: "right",
    },
    {
      icon: Users,
      title: "База членов",
      description: "Полный профиль с 50+ полями. Интеграция с DaData для валидации организаций.",
      direction: "left",
    },
    {
      icon: MessageCircle,
      title: "Обращения",
      description: "Система тикетов с автоматическим распределением. Юридические, бухгалтерские, технические.",
      direction: "bottom",
    },
    {
      icon: Building2,
      title: "Иерархия организаций",
      description: "Первичные, региональные и федеральные профсоюзы. Гибкое управление структурой.",
      direction: "top",
    },
    {
      icon: CreditCard,
      title: "Система скидок",
      description: "Интеграция с партнерами. Персональные предложения по геолокации для членов.",
      direction: "right",
    },
    {
      icon: Bell,
      title: "Уведомления",
      description: "Push, Email, Telegram. Умная система подписок и рассылок по категориям.",
      direction: "left",
    },
    {
      icon: Shield,
      title: "Безопасность",
      description: "2FA, OAuth, ролевой доступ. 6 уровней прав. Защита персональных данных.",
      direction: "bottom",
    },
  ]

  return (
    <section
      ref={ref}
      className="flex min-h-screen w-full shrink-0 snap-start items-center px-4 py-20 sm:px-6 md:px-12 md:py-24 lg:px-16"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div
          className={`mb-8 transition-all duration-700 md:mb-12 ${
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-12 opacity-0"
          }`}
        >
          <h2 className="mb-2 font-sans text-3xl font-light tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            Возможности
          </h2>
          <p className="font-mono text-xs text-foreground/60 sm:text-sm md:text-base">/ Полный функционал платформы</p>
        </div>

        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {features.map((feature, i) => {
            const Icon = feature.icon
            const getRevealClass = () => {
              if (!isVisible) {
                switch (feature.direction) {
                  case "left":
                    return "-translate-x-8 opacity-0"
                  case "right":
                    return "translate-x-8 opacity-0"
                  case "top":
                    return "-translate-y-8 opacity-0"
                  case "bottom":
                    return "translate-y-8 opacity-0"
                  default:
                    return "translate-y-8 opacity-0"
                }
              }
              return "translate-x-0 translate-y-0 opacity-100"
            }

            return (
              <div
                key={i}
                className={`group rounded-xl border border-foreground/10 bg-foreground/5 p-4 backdrop-blur-xl transition-all duration-700 hover:border-foreground/20 hover:bg-foreground/10 lg:p-5 ${getRevealClass()}`}
                style={{ transitionDelay: `${i * 75}ms` }}
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-foreground/10 transition-colors group-hover:bg-foreground/20">
                  <Icon className="h-5 w-5 text-foreground" />
                </div>
                <h3 className="mb-1.5 font-sans text-base font-medium text-foreground">{feature.title}</h3>
                <p className="text-xs leading-relaxed text-foreground/70 md:text-sm">{feature.description}</p>
              </div>
            )
          })}
        </div>

        {/* Tech Stack */}
        <div
          className={`mt-8 flex flex-wrap items-center gap-3 transition-all duration-700 md:mt-10 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
          }`}
          style={{ transitionDelay: "700ms" }}
        >
          <span className="font-mono text-xs text-foreground/50">Технологии:</span>
          {["Next.js 16", "React 19", "PostgreSQL", "GPT-4", "LangChain", "Redis", "AWS"].map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-foreground/10 bg-foreground/5 px-3 py-1 font-mono text-xs text-foreground/70"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
