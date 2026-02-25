import Link from "next/link";
import LandingHeader from "@/components/landing/LandingHeader";
import LandingFloatingBot from "@/components/landing/LandingFloatingBot";
import LandingPricing from "@/components/landing/LandingPricing";
import LandingPricingForm from "@/components/landing/LandingPricingForm";
import LandingDemoLinks from "@/components/landing/LandingDemoLinks";
import { COMPANY, CONTACTS, ROADMAP } from "@/lib/constants/landing";

export const metadata = {
  title: "MyUnion Pro для организаций — автоматизация профсоюзов",
  description:
    "Платформа для автоматизации ППО: документооборот, учёт членов профсоюза, обращения, ИИ-помощник. Узнать цены, контакты ООО ЯППИКС.",
};

export default function OrganizationsLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />

      <main>
        {/* Hero */}
        <section className="relative min-h-[32rem] py-20 md:py-28">
          {/* Spline cover — Liquid Glass */}
          <div className="absolute inset-x-0 top-0 z-0 h-full min-h-0 -bottom-60" aria-hidden>
            <div className="absolute inset-0">
              <iframe
                src="https://my.spline.design/liquidglass-o0C3CkVBFYUkytjbe2uJ9bLn-VY5/"
                frameBorder="0"
                width="100%"
                height="100%"
                className="pointer-events-none absolute inset-0 h-full w-full border-0"
                title="Liquid Glass"
              />
              <div className="absolute inset-0 bg-background/65 dark:bg-background/75" />
            </div>
          </div>
          {/* Волнистая нижняя граница Hero — закрывает надпись Built with Spline */}
          <div
            className="absolute bottom-0 left-0 right-0 z-[1] h-24 w-full md:h-28 text-[color:var(--background)]"
            aria-hidden
          >
            <svg
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
              className="h-full w-full"
              fill="currentColor"
            >
              <path d="M0,40 Q150,100 300,40 T600,40 T900,40 T1200,40 L1200,120 L0,120 Z" />
              {/* Линия волны — бордер как у секции */}
              <path
                d="M0,40 Q150,100 300,40 T600,40 T900,40 T1200,40"
                fill="none"
                stroke="var(--border)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="container relative z-10 mx-auto px-4 text-center landing-animate-in">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              Для председателей и организаций
            </div>
            <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
              Автоматизация профсоюзных организаций
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Единая платформа для ППО: документооборот, учёт членов, обращения, скидки и ИИ-помощник.
              До 80% рутины — под контролем системы.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link
                href="/login"
                className="rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary-hover"
              >
                Начать бесплатно
              </Link>
              <a
                href="#pricing"
                className="rounded-lg border border-border bg-background px-6 py-3 text-base font-semibold text-foreground hover:bg-muted"
              >
                Узнать цены
              </a>
            </div>
            <LandingDemoLinks />
          </div>
        </section>

        {/* Как мы это делаем + ИИ */}
        <section id="how" className="scroll-mt-20 border-b border-border border-t-0 py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
              Как мы это делаем
            </h2>
            <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
              <div className="landing-animate-in landing-animate-in-delay-1 rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 hover:scale-110">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5v-7.5H8.25v7.5zm12 0H8.25m0 0H4.5m12 0v-7.5m0 7.5v-7.5" />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Документооборот и учёт</h3>
                <p className="text-sm text-muted-foreground">
                  Шаблоны протоколов, повесток, постановлений. Учёт членов и организаций. Журналы и отчёты в одном месте.
                </p>
              </div>
              <div className="landing-animate-in landing-animate-in-delay-2 rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 hover:scale-110">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Обращения и коммуникация</h3>
                <p className="text-sm text-muted-foreground">
                  Обращения членов профсоюза, маршрутизация, уведомления. Чат между пользователями и с ИИ-помощником.
                </p>
              </div>
              <div className="landing-animate-in landing-animate-in-delay-3 rounded-xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-transform duration-300 hover:scale-110">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75a.75.75 0 01-.75.75h-.75m0 0v-.375c0-.621-.504-1.125-1.125-1.125H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75m15.75-4.5v.75a.75.75 0 01-.75.75h-.75m0 0v-.375c0-.621-.504-1.125-1.125-1.125H3.75m0 0h.375c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-.375M21 10.5a.75.75 0 01.75.75v.75a.75.75 0 01-.75.75h-.75M21 10.5h-3.375m0 0h-2.25" />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Скидки и партнёры</h3>
                <p className="text-sm text-muted-foreground">
                  Каталог скидок для членов профсоюза. Интеграции с партнёрами. Карты и промокоды в приложении.
                </p>
              </div>
              <div className="landing-animate-in landing-animate-in-delay-4 rounded-xl border-2 border-primary/30 bg-primary/5 p-6 shadow-sm transition-shadow hover:shadow-md">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform duration-300 hover:scale-110">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">ИИ-помощник</h3>
                <p className="text-sm text-muted-foreground">
                  Встроенный чат с искусственным интеллектом: ответы по регламентам, помощь в формулировках, подсказки по платформе. Ориентирован на продажи и поддержку внедрения.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Дорожная карта — таймлайн */}
        <section id="roadmap" className="scroll-mt-20 border-b border-border py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
              Дорожная карта
            </h2>
            <p className="mx-auto mb-12 max-w-2xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
              Планы развития платформы на 1–2 года.
            </p>
            <div className="relative mx-auto max-w-2xl pl-8 md:pl-12">
              {/* Вертикальная линия таймлайна */}
              <div
                className="absolute left-0 top-0 bottom-0 w-px bg-primary/40"
                aria-hidden
              />
              {ROADMAP.map((block, i) => (
                <div key={i} className="relative pb-10 last:pb-0">
                  {/* Узел на линии */}
                  <div
                    className="absolute -left-8 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-primary bg-background md:-left-12 md:h-5 md:w-5"
                    aria-hidden
                  >
                    <span className="h-2 w-2 rounded-full bg-primary md:h-2.5 md:w-2.5" />
                  </div>
                  {/* Блок контента */}
                  <div
                    className={`rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md ${i === 0 ? "landing-animate-in landing-animate-in-delay-2" : i === 1 ? "landing-animate-in landing-animate-in-delay-3" : "landing-animate-in landing-animate-in-delay-4"}`}
                  >
                    <h3 className="mb-3 text-base font-semibold text-foreground md:text-lg">
                      {block.period}
                    </h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      {block.items.map((item, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Стоимость и лицензирование */}
        <section id="licensing" className="scroll-mt-20 border-b border-border py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
              Стоимость и лицензирование
            </h2>
            <p className="mx-auto mb-10 max-w-3xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
              Программное обеспечение myunion.pro предоставляется на условиях возмездного лицензионного договора
              (SaaS-подписка). Публичная open-source лицензия не применяется.
            </p>
            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
              <div className="landing-animate-in landing-animate-in-delay-2 rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-2 text-lg font-semibold text-foreground">Модель предоставления</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Возмездный лицензионный договор на использование ПО.</li>
                  <li>• Доступ к функционалу по подписке (SaaS).</li>
                  <li>• Стоимость зависит от масштаба организации и сценариев внедрения.</li>
                </ul>
              </div>
              <div className="landing-animate-in landing-animate-in-delay-3 rounded-xl border border-border bg-card p-6 shadow-sm">
                <h3 className="mb-2 text-lg font-semibold text-foreground">Где запросить стоимость</h3>
                <p className="mb-3 text-sm text-muted-foreground">
                  Актуальные коммерческие условия и расчёт стоимости размещены на этой странице в разделе «Узнать цены».
                </p>
                <a
                  href="#pricing"
                  className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                >
                  Перейти к разделу «Узнать цены»
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Таблица цен и калькулятор */}
        <LandingPricing />

        {/* Форма заявки на расчёт */}
        <LandingPricingForm />

        {/* Контакты */}
        <section id="contacts" className="scroll-mt-20 border-b border-border py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
              Контакты
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
              Свяжитесь с нами по вопросам внедрения, продаж и безопасности.
            </p>
            <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
              {CONTACTS.map((c, i) => (
                <div
                  key={i}
                  className={`landing-animate-in rounded-xl border border-border bg-card p-6 transition-shadow hover:shadow-md ${i === 0 ? "landing-animate-in-delay-2" : i === 1 ? "landing-animate-in-delay-3" : "landing-animate-in-delay-4"}`}
                >
                  <p className="font-semibold text-foreground">{c.name}</p>
                  <p className="mb-2 text-sm text-muted-foreground">{c.role}</p>
                  <a href={`mailto:${c.email}`} className="block text-sm text-primary hover:underline">
                    {c.email}
                  </a>
                  <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="mt-1 block text-sm text-primary hover:underline">
                    {c.phone}
                  </a>
                </div>
              ))}
            </div>
            <div className="mx-auto mt-10 max-w-xl rounded-xl border border-border bg-card p-6 text-center landing-animate-in landing-animate-in-delay-5">
              <p className="font-semibold text-foreground">{COMPANY.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{COMPANY.address}</p>
              <p className="mt-1 text-xs text-muted-foreground">{COMPANY.addressNote}</p>
              <p className="mt-2 text-sm text-muted-foreground">{COMPANY.workingHours}</p>
            </div>
          </div>
        </section>

        {/* Футер */}
        <footer className="border-t border-border py-8">
          <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:flex-row">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {COMPANY.name}. {COMPANY.product}.
            </p>
            <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                Для членов профсоюза
              </Link>
              <Link href="/license" className="text-sm text-muted-foreground hover:text-foreground">
                Публичная оферта
              </Link>
              <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">
                Политика конфиденциальности
              </Link>
              <Link href="/requisites" className="text-sm text-muted-foreground hover:text-foreground">
                Реквизиты
              </Link>
              <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground">
                Войти
              </Link>
            </div>
          </div>
        </footer>
      </main>

      <LandingFloatingBot />
    </div>
  );
}
