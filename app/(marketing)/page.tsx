import Link from "next/link";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";
import GlassCard from "@/components/landing/GlassCard";
import ScreenshotCarousel from "@/components/landing/ScreenshotCarousel";
import MemberBenefitsGrid from "./MemberBenefitsGrid";
import MemberStatsCounter from "./MemberStatsCounter";
import MemberRoadmapSection from "./MemberRoadmapSection";
import MemberFAQSection from "./MemberFAQSection";
import { COMPANY, CONTACTS } from "@/lib/constants/landing";

export const metadata = {
  title: "MyUnion Pro — платформа для членов профсоюза",
  description:
    "Обращения, чаты, профсеть, скидки от партнёров, ИИ-помощник. Всё для членов профсоюза в одном приложении.",
};

export default function MemberLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden />
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute top-1/4 -left-32 h-[500px] w-[500px] rounded-full bg-primary/15 blur-[100px]" />
          <div className="absolute bottom-1/4 -right-32 h-[400px] w-[400px] rounded-full bg-purple-500/15 blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-cyan-500/8 blur-[120px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 sm:px-6 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <AnimateOnScroll>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full glass px-5 py-2.5 text-sm font-medium text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Для членов профсоюза
              </div>
            </AnimateOnScroll>

            <AnimateOnScroll delay={1}>
              <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Ваш профсоюз{" "}
                <span className="text-gradient">в одном приложении</span>
              </h1>
            </AnimateOnScroll>

            <AnimateOnScroll delay={2}>
              <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
                Обращения, чаты с коллегами, профсеть, эксклюзивные скидки,
                ИИ-помощник и скоро — блок санаторно-курортного оздоровления
              </p>
            </AnimateOnScroll>

            <AnimateOnScroll delay={3}>
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/login"
                  className="group relative overflow-hidden rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 hover:scale-105"
                >
                  <span className="relative z-10">Вход в личный кабинет</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-purple-600 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
                <a
                  href="#benefits"
                  className="rounded-2xl glass px-8 py-4 text-base font-semibold text-foreground transition-all hover:bg-white/15"
                >
                  Узнать больше
                </a>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative py-16 md:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <MemberStatsCounter />
        </div>
      </section>

      {/* Screenshots carousel */}
      <section id="screenshots" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <h2 className="mb-4 text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Как выглядит платформа
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={1}>
            <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground">
              Современный интерфейс для удобной работы с профсоюзом
            </p>
          </AnimateOnScroll>
          <AnimateOnScroll variant="scale" delay={2}>
            <ScreenshotCarousel />
          </AnimateOnScroll>
        </div>
      </section>

      {/* Benefits */}
      <section id="benefits" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <div className="mb-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl glass">
                <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
                </svg>
              </div>
              <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
                Всё для членов профсоюза
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                Единая платформа, которая объединяет все сервисы для вашего удобства
              </p>
            </div>
          </AnimateOnScroll>
          <MemberBenefitsGrid />
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Дорожная карта
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={1}>
            <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground">
              Планы развития платформы
            </p>
          </AnimateOnScroll>
          <MemberRoadmapSection />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Часто задаваемые вопросы
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={1}>
            <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground">
              Ответы на популярные вопросы о платформе
            </p>
          </AnimateOnScroll>
          <MemberFAQSection />
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll variant="scale">
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl p-[1px]">
              <div className="absolute inset-0 bg-gradient-to-r from-primary via-purple-500 to-cyan-500 opacity-80" />
              <div className="relative rounded-3xl bg-background/90 backdrop-blur-xl p-8 text-center sm:p-12">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                </div>
                <h2 className="mb-4 text-2xl font-bold sm:text-3xl">Готовы начать?</h2>
                <p className="mb-8 text-muted-foreground sm:text-lg">
                  Свяжитесь с председателем вашей профсоюзной организации,
                  чтобы получить приглашение на платформу
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link
                    href="/login"
                    className="rounded-2xl bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:scale-105"
                  >
                    Войти
                  </Link>
                  <Link
                    href="/for-organizations"
                    className="rounded-2xl glass px-8 py-4 font-semibold text-foreground transition-all hover:bg-white/15"
                  >
                    Для организаций
                  </Link>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Contacts */}
      <section id="contacts" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Контакты
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={1}>
            <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground">
              Свяжитесь с нами по вопросам платформы и сотрудничества
            </p>
          </AnimateOnScroll>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
            {CONTACTS.map((c, i) => (
              <AnimateOnScroll key={c.email} delay={Math.min(i + 2, 5) as 2 | 3 | 4 | 5}>
                <GlassCard className="p-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-purple-500/20 text-primary text-lg font-bold">
                    {c.name.split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <p className="font-semibold text-foreground">{c.name}</p>
                  <p className="mb-4 text-sm text-muted-foreground">{c.role}</p>
                  <div className="space-y-2">
                    <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                      {c.email}
                    </a>
                    <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <svg className="h-4 w-4 shrink-0 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                      {c.phone}
                    </a>
                  </div>
                </GlassCard>
              </AnimateOnScroll>
            ))}
          </div>
          <AnimateOnScroll delay={5}>
            <div className="mx-auto mt-10 max-w-xl">
              <GlassCard hover={false} className="p-6">
                <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:text-left">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">{COMPANY.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{COMPANY.address}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{COMPANY.workingHours}</p>
                  </div>
                </div>
              </GlassCard>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
