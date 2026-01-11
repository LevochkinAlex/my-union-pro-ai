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
import { useRouter } from "next/navigation"

export default function LandingPage() {
  const router = useRouter()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [currentSection, setCurrentSection] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const touchStartY = useRef(0)
  const touchStartX = useRef(0)
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
      const sectionWidth = scrollContainerRef.current.offsetWidth
      scrollContainerRef.current.scrollTo({
        left: sectionWidth * index,
        behavior: "smooth",
      })
      setCurrentSection(index)
    }
  }

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      touchStartY.current = e.touches[0].clientY
      touchStartX.current = e.touches[0].clientX
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (Math.abs(e.touches[0].clientY - touchStartY.current) > 10) {
        e.preventDefault()
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const touchEndY = e.changedTouches[0].clientY
      const touchEndX = e.changedTouches[0].clientX
      const deltaY = touchStartY.current - touchEndY
      const deltaX = touchStartX.current - touchEndX

      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 50) {
        if (deltaY > 0 && currentSection < 5) {
          scrollToSection(currentSection + 1)
        } else if (deltaY < 0 && currentSection > 0) {
          scrollToSection(currentSection - 1)
        }
      }
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("touchstart", handleTouchStart, { passive: true })
      container.addEventListener("touchmove", handleTouchMove, { passive: false })
      container.addEventListener("touchend", handleTouchEnd, { passive: true })
    }

    return () => {
      if (container) {
        container.removeEventListener("touchstart", handleTouchStart)
        container.removeEventListener("touchmove", handleTouchMove)
        container.removeEventListener("touchend", handleTouchEnd)
      }
    }
  }, [currentSection])

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault()

        if (!scrollContainerRef.current) return

        scrollContainerRef.current.scrollBy({
          left: e.deltaY,
          behavior: "instant",
        })

        const sectionWidth = scrollContainerRef.current.offsetWidth
        const newSection = Math.round(scrollContainerRef.current.scrollLeft / sectionWidth)
        if (newSection !== currentSection) {
          setCurrentSection(newSection)
        }
      }
    }

    const container = scrollContainerRef.current
    if (container) {
      container.addEventListener("wheel", handleWheel, { passive: false })
    }

    return () => {
      if (container) {
        container.removeEventListener("wheel", handleWheel)
      }
    }
  }, [currentSection])

  useEffect(() => {
    const handleScroll = () => {
      if (scrollThrottleRef.current) return

      scrollThrottleRef.current = requestAnimationFrame(() => {
        if (!scrollContainerRef.current) {
          scrollThrottleRef.current = undefined
          return
        }

        const sectionWidth = scrollContainerRef.current.offsetWidth
        const scrollLeft = scrollContainerRef.current.scrollLeft
        const newSection = Math.round(scrollLeft / sectionWidth)

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
    <main className="landing-page relative h-screen w-full overflow-hidden bg-[oklch(0.1_0.02_220)]">
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
        className={`fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-6 py-6 transition-opacity duration-700 md:px-12 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
      >
        <button
          onClick={() => scrollToSection(0)}
          className="flex items-center gap-2 transition-transform hover:scale-105"
        >
          <Image src="/logo-dark.svg" alt="MyUnion Pro" width={140} height={40} className="h-10 w-auto" priority />
        </button>

        <div className="hidden items-center gap-6 md:flex lg:gap-8">
          {sections.map((item, index) => (
            <button
              key={item}
              onClick={() => scrollToSection(index)}
              className={`group relative font-sans text-sm font-medium transition-colors ${
                currentSection === index ? "text-white" : "text-white/80 hover:text-white"
              }`}
            >
              {item}
              <span
                className={`absolute -bottom-1 left-0 h-px bg-white transition-all duration-300 ${
                  currentSection === index ? "w-full" : "w-0 group-hover:w-full"
                }`}
              />
            </button>
          ))}
        </div>

        <MagneticButton variant="secondary" onClick={() => router.push("/login")}>
          Войти
        </MagneticButton>
      </nav>

      <div
        ref={scrollContainerRef}
        data-scroll-container
        className={`relative z-10 flex h-screen overflow-x-auto overflow-y-hidden transition-opacity duration-700 ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {/* Hero Section */}
        <section className="flex min-h-screen w-screen shrink-0 flex-col justify-end px-6 pb-16 pt-24 md:px-12 md:pb-24">
          <div className="max-w-3xl">
            <div className="mb-4 inline-block animate-in fade-in slide-in-from-bottom-4 rounded-full border border-white/20 bg-white/15 px-4 py-1.5 backdrop-blur-md duration-700">
              <p className="font-mono text-xs text-white/90">AI-Powered Platform v1.7.1</p>
            </div>
            <h1 className="mb-6 animate-in fade-in slide-in-from-bottom-8 font-sans text-5xl font-light leading-[1.1] tracking-tight text-white duration-1000 md:text-6xl lg:text-7xl">
              <span className="text-balance">
                Единая панель
                <br />
                управления
                <br />
                <span className="text-white/60">профсоюзом</span>
              </span>
            </h1>
            <p className="mb-8 max-w-xl animate-in fade-in slide-in-from-bottom-4 text-lg leading-relaxed text-white/90 duration-1000 delay-200 md:text-xl">
              <span className="text-pretty">
                Современная платформа с AI-ассистентом для автоматизации документооборота, управления членами и
                обработки обращений. До 80% автоматизации рутинных задач.
              </span>
            </p>
            <div className="flex animate-in fade-in slide-in-from-bottom-4 flex-col gap-4 duration-1000 delay-300 sm:flex-row sm:items-center">
              <MagneticButton size="lg" variant="primary" onClick={() => scrollToSection(1)}>
                Смотреть демо
              </MagneticButton>
              <MagneticButton size="lg" variant="secondary" onClick={() => scrollToSection(3)}>
                Тарифы и цены
              </MagneticButton>
            </div>

            {/* Stats */}
            <div className="mt-12 flex animate-in fade-in slide-in-from-bottom-4 flex-wrap gap-8 duration-1000 delay-500 md:gap-12">
              <div>
                <div className="text-3xl font-light text-white md:text-4xl">50K+</div>
                <div className="font-mono text-xs text-white/60">Пользователей</div>
              </div>
              <div>
                <div className="text-3xl font-light text-white md:text-4xl">80%</div>
                <div className="font-mono text-xs text-white/60">AI-автоматизация</div>
              </div>
              <div>
                <div className="text-3xl font-light text-white md:text-4xl">-90%</div>
                <div className="font-mono text-xs text-white/60">Время обработки</div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-in fade-in duration-1000 delay-500">
            <div className="flex items-center gap-2">
              <p className="font-mono text-xs text-white/80">Прокрутите для изучения</p>
              <div className="flex h-6 w-12 items-center justify-center rounded-full border border-white/20 bg-white/15 backdrop-blur-md">
                <div className="h-2 w-2 animate-pulse rounded-full bg-white/80" />
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
        .landing-page div::-webkit-scrollbar {
          display: none;
        }
        .landing-page * {
          cursor: auto;
        }
        @media (min-width: 768px) {
          .landing-page * {
            cursor: none;
          }
        }
        .landing-page {
          --foreground: oklch(0.98 0 0);
          --background: oklch(0.1 0.02 220);
        }
      `}</style>
    </main>
  )
}
