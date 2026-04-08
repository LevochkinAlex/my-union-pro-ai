import Link from "next/link";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";
import GlassCard from "@/components/landing/GlassCard";
import MarketingContactsCards from "@/components/landing/MarketingContactsCards";
import LandingPricing from "@/components/landing/LandingPricing";
import LandingPricingForm from "@/components/landing/LandingPricingForm";
import OrgRoadmapSection from "./OrgRoadmapSection";

export const metadata = {
  title: "MyUnion Pro для организаций — автоматизация профсоюзов",
  description:
    "Платформа для автоматизации ППО: документооборот, учёт членов профсоюза, обращения, ИИ-помощник. Узнать цены.",
};

const FEATURES = [
  {
    title: "Документооборот и учёт",
    description: "Шаблоны протоколов, повесток, постановлений. Учёт членов и организаций. Журналы и отчёты в одном месте.",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5v-7.5H8.25v7.5zm12 0H8.25m0 0H4.5m12 0v-7.5m0 7.5v-7.5",
    color: "text-blue-400",
  },
  {
    title: "Обращения и коммуникация",
    description: "Обращения членов профсоюза, маршрутизация, уведомления. Чат между пользователями и с ИИ-помощником.",
    icon: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z",
    color: "text-green-400",
  },
  {
    title: "Скидки и партнёры",
    description: "Каталог скидок для членов профсоюза. Интеграции с партнёрами. Карты и промокоды в приложении.",
    icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414-.336.75-.75.75h-.75m0 0v-.375c0-.621-.504-1.125-1.125-1.125H3.75",
    color: "text-orange-400",
  },
  {
    title: "ИИ-помощник",
    description: "Встроенный чат с ИИ: ответы по регламентам, помощь в формулировках, подсказки по платформе.",
    icon: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z",
    color: "text-purple-400",
    highlight: true,
  },
];

export default function OrganizationsLandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden">
        <div className="gradient-mesh absolute inset-0" aria-hidden />
        <div className="absolute inset-0" aria-hidden>
          <div className="absolute top-1/3 -right-40 h-[600px] w-[600px] rounded-full bg-primary/20 blur-[120px]" />
          <div className="absolute bottom-1/4 -left-40 h-[500px] w-[500px] rounded-full bg-purple-500/15 blur-[100px]" />
        </div>

        <div className="relative z-10 mx-auto max-w-7xl px-4 py-24 text-center sm:px-6 md:py-32">
          <AnimateOnScroll>
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full glass px-5 py-2.5 text-sm font-medium text-primary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              Для председателей и организаций
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll delay={1}>
            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
              Автоматизация{" "}
              <span className="text-gradient">профсоюзных организаций</span>
            </h1>
          </AnimateOnScroll>

          <AnimateOnScroll delay={2}>
            <p className="mx-auto mb-10 max-w-2xl text-lg text-muted-foreground sm:text-xl leading-relaxed">
              Единая платформа для ППО: документооборот, учёт членов, обращения, скидки и ИИ-помощник.
              До 80% рутины — под контролем системы.
            </p>
          </AnimateOnScroll>

          <AnimateOnScroll delay={3}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login"
                className="rounded-2xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:scale-105"
              >
                Начать бесплатно
              </Link>
              <a
                href="#pricing"
                className="rounded-2xl glass px-8 py-4 text-base font-semibold text-foreground transition-all hover:bg-white/15"
              >
                Узнать цены
              </a>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* Features */}
      <section id="how" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <h2 className="mb-12 text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Как мы это делаем
            </h2>
          </AnimateOnScroll>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <AnimateOnScroll key={f.title} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
                <GlassCard className={`group p-6 h-full ${f.highlight ? "border-primary/30 bg-primary/5" : ""}`}>
                  <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${f.highlight ? "bg-primary text-primary-foreground" : `glass ${f.color}`} glow-ring transition-transform duration-300 group-hover:scale-110`}>
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                    </svg>
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                </GlassCard>
              </AnimateOnScroll>
            ))}
          </div>
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
              Планы развития платформы на 1–2 года
            </p>
          </AnimateOnScroll>
          <OrgRoadmapSection />
        </div>
      </section>

      {/* Licensing */}
      <section id="licensing" className="scroll-mt-20 py-16 md:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <AnimateOnScroll>
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight sm:text-4xl">
              Стоимость и лицензирование
            </h2>
          </AnimateOnScroll>
          <AnimateOnScroll delay={1}>
            <p className="mx-auto mb-10 max-w-3xl text-center text-muted-foreground">
              Программное обеспечение myunion.pro предоставляется на условиях возмездного лицензионного договора (SaaS-подписка).
            </p>
          </AnimateOnScroll>
          <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2">
            <AnimateOnScroll delay={2}>
              <GlassCard className="p-6 h-full">
                <h3 className="mb-3 text-lg font-semibold text-foreground">Модель предоставления</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Возмездный лицензионный договор на использование ПО</li>
                  <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Доступ к функционалу по подписке (SaaS)</li>
                  <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />Стоимость зависит от масштаба организации</li>
                </ul>
              </GlassCard>
            </AnimateOnScroll>
            <AnimateOnScroll delay={3}>
              <GlassCard className="p-6 h-full">
                <h3 className="mb-3 text-lg font-semibold text-foreground">Где запросить стоимость</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Актуальные коммерческие условия и расчёт стоимости размещены на этой странице ниже.
                </p>
                <a
                  href="#pricing"
                  className="inline-flex rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-lg hover:shadow-primary/25"
                >
                  Перейти к ценам
                </a>
              </GlassCard>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <LandingPricing />

      {/* Form */}
      <LandingPricingForm />

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
              Свяжитесь с нами по вопросам внедрения, продаж и безопасности
            </p>
          </AnimateOnScroll>
          <MarketingContactsCards />
        </div>
      </section>
    </>
  );
}
