"use client";

import { WESTERN_SERVICES } from "@/lib/constants/landing-members";

// SVG логотипы сервисов
const serviceLogo: Record<string, React.ReactNode> = {
  Netflix: (
    <svg viewBox="0 0 111 30" className="h-8 w-auto fill-[#E50914]">
      <path d="M105.062 14.28L111 30c-1.75-.25-3.499-.563-5.28-.845l-3.345-8.686-3.437 7.969c-1.687-.282-3.344-.376-5.031-.595l6.031-13.75L94.468 0h5.063l3.062 7.874L105.875 0h5.124l-5.937 14.28zM90.47 0h-4.594v27.25c1.5.094 3.062.156 4.594.343V0zm-8.563 26.937c-4.187-.281-8.375-.53-12.656-.625V0h4.687v21.875c2.688.062 5.375.28 7.969.405v4.657zM64.25 10.657v4.687h-6.406V26H53.22V0h13.125v4.687h-8.5v5.97h6.406zm-18.906-5.97V26.25c-1.563 0-3.156 0-4.688.062V4.687h-4.844V0h14.406v4.687h-4.874zM30.75 0v21.875c2.75.156 5.5.343 8.22.562v4.563L26.062 26V0H30.75zM21.657 6.125L21.562 26c-1.5 0-3.062.031-4.594.062l.062-15.187-4.093 15.187c-1.25.062-2.53.094-3.78.125l-4.063-15.5v15.75h-4.5V0H7.78l4.188 15.656L16 0h5.657v6.125z" />
    </svg>
  ),
  Spotify: (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-[#1DB954]">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  ),
  "YouTube Premium": (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-[#FF0000]">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  ),
  "ChatGPT Plus": (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-[#10A37F]">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z" />
    </svg>
  ),
  Midjourney: (
    <svg viewBox="0 0 24 24" className="h-10 w-10">
      <defs>
        <linearGradient id="mj-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#000" />
          <stop offset="100%" stopColor="#333" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="4" fill="url(#mj-gradient)" />
      <path d="M7 8h2l3 8 3-8h2l-4 10h-2L7 8z" fill="white" />
    </svg>
  ),
  "Apple One": (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-current text-foreground">
      <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
    </svg>
  ),
  "PlayStation Plus": (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-[#003791]">
      <path d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.181.76.814.76 1.505v5.876c2.441 1.193 4.362-.002 4.362-3.153 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.393-1.502zm3.915 15.152l6.262 2.195c2.304.775 4.838.558 4.838-2.37 0-2.95-2.086-4.069-5.287-5.231l-1.758-.637v7.16l-4.055-1.42v-4.136l2.771 1.003c.424.156.623.474.623.815s-.2.64-.623.795l-2.771-1.003v2.829zm-6.77-5.19V24l-3.915-1.46V8.932c1.355.293 2.96.738 4.478 1.317 2.618.994 4.36 2.723 4.36 5.659 0 2.836-1.643 4.025-4.923 2.855v-4.936l.018-.002c.396-.173.7-.602.7-1.143 0-.583-.347-1.05-.787-1.187L2.13 9.963v3.07l3.915 1.525v-2z" />
    </svg>
  ),
  "Adobe Creative Cloud": (
    <svg viewBox="0 0 24 24" className="h-10 w-10 fill-[#FF0000]">
      <path d="M13.966 22.624l-1.69-4.281H8.122l3.892-9.144 5.662 13.425h-3.71zm.894-18.249h9.14v18.249l-9.14-18.249zM0 22.624V4.375h9.14l-9.14 18.249z" />
    </svg>
  ),
};

const serviceColors: Record<string, string> = {
  Netflix: "from-red-500/20 to-red-600/10 border-red-500/30 hover:border-red-500/50",
  Spotify: "from-green-500/20 to-green-600/10 border-green-500/30 hover:border-green-500/50",
  "YouTube Premium": "from-red-500/20 to-red-600/10 border-red-500/30 hover:border-red-500/50",
  "ChatGPT Plus": "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 hover:border-emerald-500/50",
  Midjourney: "from-gray-500/20 to-gray-600/10 border-gray-500/30 hover:border-gray-500/50",
  "Apple One": "from-gray-500/20 to-gray-600/10 border-gray-500/30 hover:border-gray-500/50",
  "PlayStation Plus": "from-blue-500/20 to-blue-600/10 border-blue-500/30 hover:border-blue-500/50",
  "Adobe Creative Cloud": "from-red-500/20 to-red-600/10 border-red-500/30 hover:border-red-500/50",
};

export default function WesternServices() {
  return (
    <section id="services" className="scroll-mt-20 border-b border-border py-16 md:py-24">
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-4 inline-flex items-center gap-3 landing-animate-in">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
              <svg className="h-6 w-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <span className="rounded-full bg-gradient-to-r from-blue-500/20 to-purple-500/20 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400">
              <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              Скоро — лето 2026
            </span>
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in landing-animate-in-delay-1">
            Оплата западных сервисов
          </h2>
          <p className="mb-12 text-lg text-muted-foreground landing-animate-in landing-animate-in-delay-2">
            Оплачивайте любимые сервисы через MyUnion Pro — без VPN, без карт иностранных банков
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WESTERN_SERVICES.map((service, i) => (
            <div
              key={service.name}
              className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${serviceColors[service.name] || "from-primary/20 to-primary/10 border-border"} p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 landing-animate-in landing-animate-in-delay-${Math.min(i + 3, 6)}`}
            >
              <div className="mb-4 flex h-14 items-center justify-center transition-transform duration-300 group-hover:scale-110">
                {serviceLogo[service.name]}
              </div>
              <h3 className="mb-1 text-center font-semibold text-foreground">{service.name}</h3>
              <p className="text-center text-xs text-muted-foreground">{service.description}</p>
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/5 transition-transform duration-300 group-hover:scale-150" />
            </div>
          ))}
        </div>

        <div className="mx-auto mt-12 max-w-3xl landing-animate-in landing-animate-in-delay-6">
          <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-blue-500/10 p-6 md:p-8">
            <div className="relative z-10 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 text-white shadow-lg">
                <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
              </div>
              <div>
                <h3 className="mb-2 text-lg font-semibold text-foreground">Как это работает?</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Профсоюз объединяет платежи участников и оплачивает подписки централизованно через международные каналы. 
                  Вы получаете доступ к сервисам без переплат и сложностей — всё прозрачно и легально.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
