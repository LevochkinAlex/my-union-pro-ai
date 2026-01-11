"use client"

import { useReveal } from "@/hooks/use-reveal"
import { MagneticButton } from "@/components/landing/magnetic-button"
import { Users, FileText, MessageSquare, Shield, Bell } from "lucide-react"

export function DemoSection() {
  const { ref, isVisible } = useReveal(0.3)

  const demoFeatures = [
    {
      icon: MessageSquare,
      title: "AI-чат ассистент",
      description: "Автоматические ответы на обращения членов профсоюза",
    },
    {
      icon: FileText,
      title: "Генерация документов",
      description: "Создание заявлений, справок и форм одним кликом",
    },
    {
      icon: Users,
      title: "Управление членами",
      description: "Полная база участников с историей взаимодействий",
    },
    {
      icon: Shield,
      title: "Юридическая поддержка",
      description: "База знаний по трудовому праву с AI-помощником",
    },
    {
      icon: Bell,
      title: "Уведомления",
      description: "Push, Email и Telegram рассылки для членов",
    },
  ]

  return (
    <section
      ref={ref}
      className="flex h-screen w-screen shrink-0 snap-start items-center px-6 pt-20 md:px-12 md:pt-0 lg:px-16"
    >
      <div className="mx-auto w-full max-w-7xl">
        <div
          className={`mb-8 transition-all duration-700 md:mb-12 ${
            isVisible ? "translate-y-0 opacity-100" : "-translate-y-12 opacity-0"
          }`}
        >
          <h2 className="mb-2 font-sans text-4xl font-light tracking-tight text-foreground md:text-5xl lg:text-6xl">
            Демо платформы
          </h2>
          <p className="font-mono text-sm text-foreground/60 md:text-base">/ Попробуйте прямо сейчас</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div
            className={`relative transition-all duration-700 ${
              isVisible ? "translate-x-0 opacity-100" : "-translate-x-16 opacity-0"
            }`}
            style={{ transitionDelay: "200ms" }}
          >
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-foreground/10 bg-black">
              <iframe
                src="https://vkvideo.ru/video_ext.php?oid=-235299009&id=456239017&hash=f09b29995c076c20"
                width="100%"
                height="100%"
                frameBorder="0"
                allowFullScreen
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                className="absolute inset-0 h-full w-full"
              />
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <MagneticButton variant="primary" onClick={() => window.open("https://myunion.pro", "_blank")}>
                Открыть платформу
              </MagneticButton>
              <MagneticButton variant="secondary" onClick={() => window.open("https://myunion.pro/login", "_blank")}>
                Тестовый доступ
              </MagneticButton>
            </div>
          </div>

          {/* Features List */}
          <div className="space-y-4">
            {demoFeatures.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={i}
                  className={`group flex items-start gap-4 rounded-xl border border-foreground/10 bg-foreground/5 p-4 backdrop-blur-xl transition-all duration-700 hover:border-foreground/20 hover:bg-foreground/10 ${
                    isVisible ? "translate-x-0 opacity-100" : "translate-x-16 opacity-0"
                  }`}
                  style={{ transitionDelay: `${300 + i * 100}ms` }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground/10 transition-colors group-hover:bg-foreground/20">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-sans text-base font-medium text-foreground md:text-lg">{feature.title}</h3>
                    <p className="text-sm text-foreground/70">{feature.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
