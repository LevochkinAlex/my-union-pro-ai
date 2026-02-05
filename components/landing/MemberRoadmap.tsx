"use client";

import { MEMBER_ROADMAP } from "@/lib/constants/landing-members";
import { ReactNode } from "react";

const iconMap: Record<string, ReactNode> = {
  check: (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  ),
  rocket: (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  ),
  coins: (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  ),
  graduation: (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
    </svg>
  ),
};

const statusColors: Record<number, { bg: string; shadow: string }> = {
  0: { bg: "bg-gradient-to-br from-green-500 to-emerald-600", shadow: "shadow-green-500/30" },
  1: { bg: "bg-gradient-to-br from-blue-500 to-cyan-600", shadow: "shadow-blue-500/30" },
  2: { bg: "bg-gradient-to-br from-purple-500 to-pink-600", shadow: "shadow-purple-500/30" },
  3: { bg: "bg-gradient-to-br from-orange-500 to-red-600", shadow: "shadow-orange-500/30" },
};

const labelColors: Record<number, string> = {
  0: "bg-green-500/20 text-green-700 dark:text-green-400",
  1: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  2: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
  3: "bg-orange-500/20 text-orange-700 dark:text-orange-400",
};

const bulletColors: Record<number, string> = {
  0: "bg-green-500/20 text-green-600",
  1: "bg-blue-500/20 text-blue-600",
  2: "bg-purple-500/20 text-purple-600",
  3: "bg-orange-500/20 text-orange-600",
};

export default function MemberRoadmap() {
  return (
    <section id="roadmap" className="scroll-mt-20 border-b border-border py-16 md:py-24 bg-muted/30 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20">
            <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
            </svg>
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
            Дорожная карта развития
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground landing-animate-in landing-animate-in-delay-1">
            Что уже работает и что появится в ближайшее время
          </p>
        </div>

        <div className="mx-auto max-w-4xl">
          <div className="relative">
            {/* Вертикальная линия таймлайна */}
            <div
              className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-green-500 via-blue-500 via-purple-500 to-orange-500 md:left-1/2 md:-translate-x-1/2"
              aria-hidden
            />

            {MEMBER_ROADMAP.map((block, i) => (
              <div
                key={block.period}
                className={`relative mb-8 last:mb-0 landing-animate-in landing-animate-in-delay-${Math.min(i + 2, 6)}`}
              >
                <div
                  className={`flex items-start gap-4 md:gap-8 ${
                    i % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"
                  }`}
                >
                  {/* Узел на линии */}
                  <div
                    className={`absolute left-6 z-10 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-2xl ${statusColors[i].bg} ${statusColors[i].shadow} text-white shadow-lg md:left-1/2`}
                    aria-hidden
                  >
                    {iconMap[block.icon]}
                  </div>

                  {/* Пустой блок для выравнивания */}
                  <div className="hidden md:block md:w-1/2" />

                  {/* Блок контента */}
                  <div
                    className={`ml-20 flex-1 md:ml-0 md:w-1/2 ${
                      i % 2 === 0 ? "md:pl-10" : "md:pr-10"
                    }`}
                  >
                    <div
                      className={`group rounded-2xl border bg-card p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                        i === 0
                          ? "border-green-500/30 bg-gradient-to-br from-green-500/10 to-emerald-500/5"
                          : "border-border hover:border-primary/30"
                      }`}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center rounded-full px-4 py-1.5 text-sm font-semibold ${labelColors[i]}`}
                        >
                          {i === 0 && (
                            <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-green-500" />
                          )}
                          {block.period}
                        </span>
                        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${bulletColors[i]} opacity-50 group-hover:opacity-100 transition-opacity`}>
                          {iconMap[block.icon]}
                        </div>
                      </div>
                      <ul className="space-y-3">
                        {block.items.map((item, j) => (
                          <li key={item} className="flex items-start gap-3 text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-medium ${bulletColors[i]}`}
                            >
                              {j + 1}
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
