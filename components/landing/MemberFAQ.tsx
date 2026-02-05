"use client";

import { useState } from "react";
import { MEMBER_FAQ } from "@/lib/constants/landing-members";

export default function MemberFAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="scroll-mt-20 border-b border-border py-16 md:py-24 bg-muted/30 relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <div className="mb-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20">
            <svg className="h-8 w-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h2 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl landing-animate-in">
            Частые вопросы
          </h2>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground landing-animate-in landing-animate-in-delay-1">
            Ответы на популярные вопросы о платформе
          </p>
        </div>

        <div className="mx-auto max-w-2xl space-y-4">
          {MEMBER_FAQ.map((item, i) => (
            <div
              key={item.question}
              className={`group overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:shadow-md landing-animate-in landing-animate-in-delay-${Math.min(i + 2, 6)}`}
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center gap-4 p-5 text-left transition-colors hover:bg-muted/50"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all ${
                  openIndex === i 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-primary/10 text-primary group-hover:bg-primary/20"
                }`}>
                  <span className="text-lg font-semibold">{i + 1}</span>
                </span>
                <span className="flex-1 font-medium text-foreground">{item.question}</span>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
                  openIndex === i ? "bg-primary/20 rotate-180" : "bg-muted"
                }`}>
                  <svg
                    className="h-4 w-4 text-muted-foreground"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === i ? "max-h-96" : "max-h-0"
                }`}
              >
                <div className="border-t border-border bg-gradient-to-r from-primary/5 to-transparent p-5">
                  <p className="text-sm text-muted-foreground leading-relaxed pl-14">
                    {item.answer}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Additional help CTA */}
        <div className="mx-auto mt-10 max-w-md text-center landing-animate-in landing-animate-in-delay-6">
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
            Не нашли ответ?
            <svg className="h-5 w-5 text-primary animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
            </svg>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Спросите нашего <span className="font-medium text-primary">ИИ-помощника</span> в чате справа внизу
          </p>
        </div>
      </div>
    </section>
  );
}
