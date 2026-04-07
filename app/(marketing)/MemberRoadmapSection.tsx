"use client";

import { MEMBER_ROADMAP } from "@/lib/constants/landing-members";
import AnimateOnScroll from "@/components/landing/AnimateOnScroll";
import GlassCard from "@/components/landing/GlassCard";

const iconMap: Record<string, string> = {
  check: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  rocket: "M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z",
  coins: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  graduation: "M4.26 10.147a60.438 60.438 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.636 50.636 0 00-2.658-.813A59.906 59.906 0 0112 3.493a59.903 59.903 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5",
};

export default function MemberRoadmapSection() {
  return (
    <div className="relative mx-auto max-w-2xl pl-8 md:pl-12">
      <div className="absolute left-0 top-0 bottom-0 w-px bg-gradient-to-b from-primary/60 via-purple-500/40 to-transparent" aria-hidden />

      {MEMBER_ROADMAP.map((block, i) => (
        <AnimateOnScroll key={block.period} delay={Math.min(i + 2, 5) as 2 | 3 | 4 | 5}>
          <div className="relative pb-10 last:pb-0">
            <div className="absolute -left-8 top-2 flex h-5 w-5 items-center justify-center rounded-full glass border-2 border-primary md:-left-12" aria-hidden>
              <span className="h-2 w-2 rounded-full bg-primary" />
            </div>
            <GlassCard className="p-5">
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[block.icon] || iconMap.check} />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-foreground md:text-lg">
                  {block.period}
                </h3>
              </div>
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
