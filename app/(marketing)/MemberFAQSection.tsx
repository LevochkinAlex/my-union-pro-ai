"use client";

import { useState } from "react";
import { MEMBER_FAQ } from "@/lib/constants/landing-members";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";

export default function MemberFAQSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {MEMBER_FAQ.map((item, i) => {
        const isOpen = openIdx === i;
        return (
          <AnimateOnScroll key={i} delay={Math.min(i + 1, 5) as 1 | 2 | 3 | 4 | 5}>
            <div className="glass rounded-2xl overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="flex w-full items-center justify-between px-6 py-4 text-left"
              >
                <span className="text-sm font-semibold text-foreground sm:text-base">
                  {item.question}
                </span>
                <svg
                  className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                }`}
              >
                <p className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </div>
          </AnimateOnScroll>
        );
      })}
    </div>
  );
}
