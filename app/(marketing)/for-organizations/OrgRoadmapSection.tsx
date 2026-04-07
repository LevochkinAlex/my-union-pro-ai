"use client";

import { ROADMAP } from "@/lib/constants/landing";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";
import GlassCard from "@/components/landing/GlassCard";

export default function OrgRoadmapSection() {
  return (
    <div className="relative mx-auto max-w-2xl pl-8 md:pl-12">
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary/60 via-purple-500/40 to-transparent" aria-hidden />

      {ROADMAP.map((block, i) => (
        <AnimateOnScroll key={block.period} delay={Math.min(i + 2, 5) as 2 | 3 | 4 | 5}>
          <div className="relative pb-10 last:pb-0">
            <div className="absolute -left-8 top-2 flex h-5 w-5 items-center justify-center rounded-full glass border-2 border-primary md:-left-12" aria-hidden>
              <span className="h-2 w-2 rounded-full bg-primary" />
            </div>
            <GlassCard className="p-5">
              <h3 className="mb-3 text-base font-semibold text-foreground md:text-lg">
                {block.period}
              </h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {block.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    {item}
                  </li>
                ))}
              </ul>
            </GlassCard>
          </div>
        </AnimateOnScroll>
      ))}
    </div>
  );
}
