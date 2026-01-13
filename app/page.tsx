"use client"

import { Shader, ChromaFlow, Swirl } from "shaders/react"
import { CustomCursor } from "@/components/landing/custom-cursor"
import { GrainOverlay } from "@/components/landing/grain-overlay"
import { FeaturesSection } from "@/components/landing/sections/features-section"
import { PricingSection } from "@/components/landing/sections/pricing-section"
import { RoadmapSection } from "@/components/landing/sections/roadmap-section"
import { DemoSection } from "@/components/landing/sections/demo-section"
import { ContactSection } from "@/components/landing/sections/contact-section"
import { ChatWidget } from "@/components/landing/chat-widget"
import { MagneticButton } from "@/components/landing/magnetic-button"
import { useRef, useEffect, useState } from "react"
import Image from "next/image"

export default function Home() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [currentSection, setCurrentSection] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const shaderContainerRef = useRef<HTMLDivElement>(null)
  const scrollThrottleRef = useRef<number | undefined>(undefined)

  const sections = ["Главная", "Демо", "Возможности", "Цены", "Дорожная карта", "Контакты"]

  useEffect(() => {
    const checkShaderReady = () => {
      if (shaderContainerRef.current) {
        const canvas = shaderContainerRef.current.querySelector("canvas")
        if (canvas && canvas.width > 0 && canvas.height > 0) {
          setIsLoaded(true)
          return true
        }
      }
      return false
    }

    if (checkShaderReady()) return

    const intervalId = setInterval(() => {
      if (checkShaderReady()) {
        clearInterval(intervalId)
      }
    }, 100)

    const fallbackTimer = setTimeout(() => {
      setIsLoaded(true)
    }, 1500)

    return () => {
      clearInterval(intervalId)
      clearTimeout(fallbackTimer)
    }
  }, [])

  const scrollToSection = (index: number) => {
    if (scrollContainerRef.current) {
      const sectionHeight = scrollContainerRef.current.offsetHeight
      scrollContainerRef.current.scrollTo({
        top: sectionHeight * index,
        behavior: "smooth",
      })
      setCurrentSection(index)
    }
  }

  // Удаляем обработчики touch для горизонтального скролла - используем стандартный вертикальный скролл

  // Удаляем обработчик wheel для горизонтального скролла - используем стандартный вертикальный скролл

  useEffect(() => {
    const handleScroll = () => {
      if (scrollThrottleRef.current) return

      scrollThrottleRef.current = requestAnimationFrame(() => {
        if (!scrollContainerRef.current) {
          scrollThrottleRef.current = undefined
          return
        }

        const sectionHeight = scrollContainerRef.current.offsetHeight
        const scrollTop = scrollContainerRef.current.scrollTop
        const newSection = Math.round(scrollTop / sectionHeight)

        if (newSection !== currentSection && newSection >= 0 && newSection <= 5) {
          setCurrentSection(newSection)
        }

        scrollThrottleRef.current = undefined
      })
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("scroll", handleScroll, { passive: true })
    }

    return () => {
      if (container) {
        container.removeEventListener("scroll", handleScroll)
      }
      if (scrollThrottleRef.current) {
        cancelAnimationFrame(scrollThrottleRef.current)
      }
    }
  }, [currentSection])

  return (
    <main className="relative min-h-screen w-full bg-background">
      <CustomCursor />
      <GrainOverlay />

      <div
        ref={shaderContainerRef}
        className={`fixed inset-0 z-0 transition-opacity duration-700 ${isLoaded ? "opacity-100" : "opacity-0"}`}
        style={{ contain: "strict" }}
      >
        <Shader className="h-full w-full">
          <Swirl
            colorA="#0066cc"
            colorB="#00a86b"
            speed={0.6}
          />
          <ChromaFlow
            baseColor="#0066cc"
            upColor="#0066cc"
            downColor="#d1d1d1"
            leftColor="#00a86b"
            rightColor="#00a86b"
            intensity={0.9}
            radius={1.8}
            momentum={25}
            maskType="alpha"
            opacity={0.97}
          />
        </Shader>
        <div className="absolute inset-0 bg-black/30" />
      </div>

      {/* Navigation */}
      <nav
        className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-between bg-background/80 backdrop-blur-md px-4 py-4 transition-opacity duration-700 sm:px-6 sm:py-6 md:px-12 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={() => scrollToSection(0)}
          className="flex items-center gap-2 transition-transform hover:scale-105"
        >
          <Image src="/logo-dark.svg" alt="MyUnion Pro" width={140} height={40} className="h-8 w-auto sm:h-10" priority />
        </button>

        {/* Desktop Navigation */}
        <div className="hidden items-center gap-4 md:flex lg:gap-8">
          {sections.map((item, index) => (
            <button
              key={item}
              onClick={() => scrollToSection(index)}
              className={`group relative font-sans text-xs font-medium transition-colors sm:text-sm ${
                currentSection === index ? "text-foreground" : "text-foreground/80 hover:text-foreground"
              }`}
            >
              {item}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-foreground transition-all duration-300 ${
                  currentSection === index ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-3 md:hidden">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-foreground/20 bg-foreground/10 transition-colors hover:bg-foreground/20"
            aria-label="Меню"
          >
            <svg
              className={`h-5 w-5 text-foreground transition-transform ${isMobileMenuOpen ? "rotate-90" : ""}`}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {isMobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
          <MagneticButton variant="secondary" onClick={() => window.location.href = "/login"}>
            Войти
          </MagneticButton>
        </div>

        {/* Desktop Login Button */}
        <div className="hidden md:block">
          <MagneticButton variant="secondary" onClick={() => window.location.href = "/login"}>
            Войти
          </MagneticButton>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-x-0 top-[73px] z-40 border-t border-foreground/10 bg-background/95 backdrop-blur-md md:hidden">
          <div className="flex flex-col px-4 py-4">
            {sections.map((item, index) => (
              <button
                key={item}
                onClick={() => {
                  scrollToSection(index)
                  setIsMobileMenuOpen(false)
                }}
                className={`px-4 py-3 text-left font-sans text-base font-medium transition-colors ${
                  currentSection === index
                    ? "text-foreground border-l-2 border-foreground"
                    : "text-foreground/70 hover:text-foreground"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        data-scroll-container
        className={`relative z-10 overflow-y-auto overflow-x-hidden transition-opacity duration-700 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ 
          scrollbarWidth: "none", 
          msOverflowStyle: "none",
          height: "100vh",
          scrollBehavior: "smooth"
        }}
      >
        {/* Hero Section */}
        <section className="flex min-h-screen w-full shrink-0 flex-col justify-end px-4 pb-16 pt-20 sm:px-6 sm:pt-24 md:px-12 md:pb-24">
          <div className="max-w-3xl">
            <div className="mb-4 inline-block animate-in fade-in slide-in-from-bottom-4 rounded-full border border-foreground/20 bg-foreground/15 px-4 py-1.5 backdrop-blur-md duration-700">
              <p className="font-mono text-xs text-foreground/90">AI-Powered Platform v1.6.1</p>
            </div>
            <h1 className="mb-4 animate-in fade-in slide-in-from-bottom-8 font-sans text-3xl font-light leading-[1.1] tracking-tight text-foreground duration-1000 sm:mb-6 sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
              <span className="text-balance">
                Единая панель
                <br />
                управления
                <br />
                <span className="text-foreground/60">профсоюзом</span>
              </span>
            </h1>
            <p className="mb-6 max-w-xl animate-in fade-in slide-in-from-bottom-4 text-base leading-relaxed text-foreground/90 duration-1000 delay-200 sm:mb-8 sm:text-lg md:text-xl">
              <span className="text-pretty">
                Современная платформа с AI-ассистентом для автоматизации документооборота, управления членами и
                обработки обращений. До 80% автоматизации рутинных задач.
              </span>
            </p>
            <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col gap-3 duration-1000 delay-300 sm:flex-row sm:items-center sm:gap-4">
              <MagneticButton size="lg" variant="primary" onClick={() => scrollToSection(1)}>
                Смотреть демо
              </MagneticButton>
              <MagneticButton size="lg" variant="secondary" onClick={() => scrollToSection(3)}>
                Тарифы и цены
              </MagneticButton>
            </div>

            {/* Stats */}
            <div className="mt-8 flex animate-in fade-in slide-in-from-bottom-4 flex-wrap gap-6 duration-1000 delay-500 sm:mt-12 sm:gap-8 md:gap-12">
              <div>
                <div className="text-2xl font-light text-foreground sm:text-3xl md:text-4xl">50K+</div>
                <div className="font-mono text-xs text-foreground/60">Пользователей</div>
              </div>
              <div>
                <div className="text-2xl font-light text-foreground sm:text-3xl md:text-4xl">80%</div>
                <div className="font-mono text-xs text-foreground/60">AI-автоматизация</div>
              </div>
              <div>
                <div className="text-2xl font-light text-foreground sm:text-3xl md:text-4xl">-90%</div>
                <div className="font-mono text-xs text-foreground/60">Время обработки</div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 animate-in fade-in duration-1000 delay-500 sm:bottom-8">
            <div className="flex items-center gap-2">
              <p className="hidden font-mono text-xs text-foreground/80 sm:block">Прокрутите для изучения</p>
              <div className="flex h-6 w-12 items-center justify-center rounded-full border border-foreground/20 bg-foreground/15 backdrop-blur-md">
                <div className="h-2 w-2 animate-pulse rounded-full bg-foreground/80" />
              </div>
            </div>
          </div>
        </section>

        <DemoSection />
        <FeaturesSection />
        <PricingSection />
        <RoadmapSection />
        <ContactSection />
      </div>

      {/* AI Chat Widget */}
      <ChatWidget />

      <style jsx global>{`
        [data-scroll-container]::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </main>
  )
}
