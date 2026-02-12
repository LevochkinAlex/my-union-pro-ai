import Link from "next/link";
import MemberLandingHeader from "@/components/landing/MemberLandingHeader";
import MemberBenefits from "@/components/landing/MemberBenefits";
import MemberRoadmap from "@/components/landing/MemberRoadmap";
import MemberFAQ from "@/components/landing/MemberFAQ";
import MemberStats from "@/components/landing/MemberStats";
import LandingFloatingBot from "@/components/landing/LandingFloatingBot";
import MemberDemoLink from "@/components/landing/MemberDemoLink";
import { COMPANY, CONTACTS } from "@/lib/constants/landing";

export const metadata = {
  title: "MyUnion Pro — платформа для членов профсоюза",
  description:
    "Обращения, чаты, профсеть, скидки от партнёров, ИИ-помощник и оплата западных сервисов. Всё для членов профсоюза в одном приложении.",
};

export default function MemberLandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MemberLandingHeader />

      <main>
        {/* Hero */}
        <section className="relative min-h-[40rem] py-20 md:py-28 overflow-hidden">
          {/* Gradient background */}
          <div className="absolute inset-0 z-0" aria-hidden>
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-purple-500/5" />
            <div className="absolute top-1/4 -left-1/4 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
            <div className="absolute bottom-1/4 -right-1/4 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
          </div>
          
          {/* Decorative floating elements with icons */}
          <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
            <div className="absolute top-20 left-[10%] animate-float">
              <div className="rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/10 p-4 shadow-lg backdrop-blur border border-green-500/20">
                <svg className="h-8 w-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
              </div>
            </div>
            <div className="absolute top-32 right-[15%] animate-float-delayed">
              <div className="rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/10 p-4 shadow-lg backdrop-blur border border-orange-500/20">
                <svg className="h-8 w-8 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H5.25a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h18c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125h-18c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-32 left-[15%] animate-float-slow">
              <div className="rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-4 shadow-lg backdrop-blur border border-purple-500/20">
                <svg className="h-8 w-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                </svg>
              </div>
            </div>
            <div className="absolute bottom-40 right-[10%] animate-float">
              <div className="rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 p-4 shadow-lg backdrop-blur border border-blue-500/20">
                <svg className="h-8 w-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
                </svg>
              </div>
            </div>
          </div>

          <div className="container relative z-10 mx-auto px-4">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              {/* Left: Text content */}
              <div className="text-center lg:text-left landing-animate-in">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  Для членов профсоюза
                </div>
                
                <h1 className="mb-6 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-6xl">
                  Ваш профсоюз
                  <br />
                  <span className="bg-gradient-to-r from-primary via-purple-500 to-blue-500 bg-clip-text text-transparent">
                    в одном приложении
                  </span>
                </h1>
                
                <p className="mb-8 max-w-xl text-lg text-muted-foreground md:text-xl leading-relaxed">
                  Обращения, чаты с коллегами, профсеть, эксклюзивные скидки, 
                  ИИ-помощник и скоро — блок санаторно-курортного оздоравления
                </p>
                
                <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
                  <Link
                    href="/login"
                    className="group relative overflow-hidden rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:shadow-xl hover:scale-105"
                  >
                    <span className="relative z-10">Вход в личный кабинет</span>
                    <div className="absolute inset-0 -z-0 bg-gradient-to-r from-primary to-purple-600 opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                  <a
                    href="#benefits"
                    className="rounded-xl border border-border bg-background px-8 py-4 text-base font-semibold text-foreground transition-all hover:bg-muted hover:border-primary/30"
                  >
                    Узнать больше
                  </a>
                </div>
                
                <MemberDemoLink />
              </div>

              {/* Right: Hero illustration */}
              <div className="relative hidden lg:block landing-animate-in landing-animate-in-delay-2">
                <div className="relative mx-auto w-full max-w-lg">
                  {/* Phone mockup with app preview */}
                  <div className="relative mx-auto w-72">
                    {/* Phone frame */}
                    <div className="rounded-[3rem] bg-gradient-to-b from-gray-800 to-gray-900 p-3 shadow-2xl">
                      <div className="rounded-[2.5rem] bg-background overflow-hidden">
                        {/* Status bar */}
                        <div className="flex items-center justify-between bg-primary/10 px-6 py-2">
                          <span className="text-xs font-medium">9:41</span>
                          <div className="flex items-center gap-1">
                            <div className="h-3 w-3 rounded-full bg-primary/60" />
                            <div className="h-3 w-3 rounded-full bg-primary/40" />
                            <div className="h-3 w-3 rounded-full bg-primary/20" />
                          </div>
                        </div>
                        {/* App content preview */}
                        <div className="p-4 space-y-4 min-h-[400px]">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center text-white font-bold">
                              МП
                            </div>
                            <div>
                              <p className="font-semibold text-sm">MyUnion Pro</p>
                              <p className="text-xs text-muted-foreground">Личный кабинет</p>
                            </div>
                          </div>
                          
                          {/* Feature cards preview */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="rounded-xl bg-blue-500/10 p-3 text-center">
                              <svg className="mx-auto h-6 w-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                              </svg>
                              <p className="mt-1 text-xs font-medium">Обращения</p>
                            </div>
                            <div className="rounded-xl bg-green-500/10 p-3 text-center">
                              <svg className="mx-auto h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                              </svg>
                              <p className="mt-1 text-xs font-medium">Чаты</p>
                            </div>
                            <div className="rounded-xl bg-orange-500/10 p-3 text-center">
                              <svg className="mx-auto h-6 w-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
                              </svg>
                              <p className="mt-1 text-xs font-medium">Скидки</p>
                            </div>
                            <div className="rounded-xl bg-purple-500/10 p-3 text-center">
                              <svg className="mx-auto h-6 w-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                              </svg>
                              <p className="mt-1 text-xs font-medium">ИИ</p>
                            </div>
                          </div>

                          {/* Notification preview */}
                          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
                            <div className="flex items-center gap-2">
                              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center">
                                <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs font-medium">Новая скидка!</p>
                                <p className="text-xs text-muted-foreground">-30% в кафе «Уют»</p>
                              </div>
                            </div>
                          </div>

                          {/* AI chat preview */}
                          <div className="rounded-xl bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-3">
                            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                              </svg>
                              ИИ-помощник
                            </p>
                            <p className="text-xs">«Как подать обращение в профком?»</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Floating badges around phone */}
                    <div className="absolute -top-4 -right-4 rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white shadow-lg animate-bounce">
                      Бесплатно
                    </div>
                    <div className="absolute -bottom-2 -left-4 rounded-full bg-blue-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
                      24/7
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <MemberStats />

        {/* Benefits */}
        <MemberBenefits />

        {/* Roadmap */}
        <MemberRoadmap />

        {/* FAQ */}
        <MemberFAQ />

        {/* CTA Section */}
        <section className="py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="relative mx-auto max-w-3xl overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-purple-600 to-blue-600 p-8 text-center text-white shadow-2xl md:p-12 landing-animate-in">
              {/* Background pattern */}
              <div className="absolute inset-0 opacity-10" aria-hidden>
                <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <defs>
                    <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
                      <circle cx="1" cy="1" r="1" fill="white" />
                    </pattern>
                  </defs>
                  <rect width="100" height="100" fill="url(#grid)" />
                </svg>
              </div>
              
              <div className="relative z-10">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
                  <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                  </svg>
                </div>
                <h2 className="mb-4 text-2xl font-bold md:text-3xl">
                  Готовы начать?
                </h2>
                <p className="mb-8 text-white/90 md:text-lg">
                  Свяжитесь с председателем вашей профсоюзной организации, 
                  чтобы получить приглашение на платформу
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link
                    href="/login"
                    className="rounded-xl bg-white px-8 py-4 font-semibold text-primary shadow-lg transition-all hover:bg-white/90 hover:scale-105"
                  >
                    Войти
                  </Link>
                  <Link
                    href="/for-organizations"
                    className="rounded-xl border-2 border-white/30 bg-white/10 px-8 py-4 font-semibold text-white backdrop-blur transition-all hover:bg-white/20"
                  >
                    Для организаций
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Контакты */}
        <section id="contacts" className="scroll-mt-20 border-b border-border py-16 md:py-24">
          <div className="container mx-auto px-4">
            <h2 className="mb-2 text-center text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
              Контакты
            </h2>
            <p className="mx-auto mb-10 max-w-2xl text-center text-muted-foreground landing-animate-in landing-animate-in-delay-1">
              Свяжитесь с нами по вопросам платформы и сотрудничества.
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
              <p className="mt-2 text-sm text-muted-foreground">{COMPANY.workingHours}</p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-8">
          <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 md:flex-row">
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} {COMPANY.name}. {COMPANY.product}.
            </p>
            <div className="flex gap-6">
              <Link href="/for-organizations" className="text-sm text-muted-foreground hover:text-foreground">
                Для организаций
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
