"use client"

import { useReveal } from "@/hooks/use-reveal"
import { Check, Clock, Sparkles } from "lucide-react"

export function RoadmapSection() {
  const { ref, isVisible } = useReveal(0.3)

  const roadmapItems = [
    {
      year: "2025",
      quarter: "Q1",
      title: "Версия 1.6",
      status: "completed",
      items: ["AI-чат с RAG системой", "Генерация PDF документов", "База знаний профсоюза", "Push-уведомления"],
    },
    {
      year: "2025",
      quarter: "Q2-Q3",
      title: "Версия 2.0",
      status: "in-progress",
      items: ["Мобильное приложение iOS/Android", "Голосовой AI-ассистент", "Интеграция с 1С", "Расширенная аналитика"],
    },
    {
      year: "2025",
      quarter: "Q4",
      title: "Версия 2.5",
      status: "planned",
      items: ["Видеоконференции", "Электронное голосование", "Юридический AI-помощник", "Коллективные договоры"],
    },
    {
      year: "2026",
      quarter: "Q1-Q2",
      title: "Версия 3.0",
      status: "planned",
      items: ["Блокчейн для голосований", "Международная локализация", "AI для переговоров", "Предиктивная аналитика"],
    },
    {
      year: "2027",
      quarter: "Q1",
      title: "Версия 4.0",
      status: "planned",
      items: ["Полная автономия AI", "Федерация профсоюзов", "Интеграция с госуслугами", "Метавселенная профсоюзов"],
    },
  ]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <Check className="h-4 w-4" />
      case "in-progress":
        return <Clock className="h-4 w-4" />
      default:
        return <Sparkles className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500/20 text-green-400 border-green-500/30"
      case "in-progress":
        return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
      default:
        return "bg-foreground/10 text-foreground/60 border-foreground/20"
    }
  }

  return (
    <section
      ref={ref}
      className="flex min-h-screen w-full shrink-0 snap-start items-center px-4 py-20 sm:px-6 md:px-12 md:py-24 lg:px-16"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div
          className={`mb-8 transition-all duration-700 md:mb-10 ${
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-12 opacity-0"
          }`}
        >
          <h2 className="mb-2 font-sans text-3xl font-light tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl">
            Дорожная карта
          </h2>
          <p className="font-mono text-xs text-foreground/60 sm:text-sm md:text-base">/ Развитие до 2027 года</p>
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-0 top-0 hidden h-1 w-full bg-foreground/10 md:block" />

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 md:gap-6">
            {roadmapItems.map((item, i) => (
              <div
                key={i}
                className={`relative transition-all duration-700 ${
                  isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
                }`}
                style={{ transitionDelay: `${200 + i * 100}ms` }}
              >
                {/* Timeline Dot */}
                <div className="absolute -top-2 left-4 hidden h-4 w-4 rounded-full border-2 border-background bg-foreground/40 md:block" />

                <div className="rounded-xl border border-foreground/10 bg-foreground/5 p-4 backdrop-blur-xl md:mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-lg font-medium text-foreground">{item.year}</span>
                    <span
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${getStatusColor(item.status)}`}
                    >
                      {getStatusIcon(item.status)}
                      {item.quarter}
                    </span>
                  </div>

                  <h3 className="mb-3 font-sans text-base font-medium text-foreground">{item.title}</h3>

                  <ul className="space-y-1.5">
                    {item.items.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2 text-xs text-foreground/70">
                        <div className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground/40" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div
          className={`mt-8 flex flex-wrap gap-4 transition-all duration-700 ${
            isVisible ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
          }`}
          style={{ transitionDelay: "800ms" }}
        >
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
              <Check className="h-3 w-3 text-green-400" />
            </div>
            <span className="font-mono text-xs text-foreground/60">Выполнено</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500/20">
              <Clock className="h-3 w-3 text-yellow-400" />
            </div>
            <span className="font-mono text-xs text-foreground/60">В разработке</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-foreground/10">
              <Sparkles className="h-3 w-3 text-foreground/60" />
            </div>
            <span className="font-mono text-xs text-foreground/60">Запланировано</span>
          </div>
        </div>
      </div>
    </section>
  )
}
