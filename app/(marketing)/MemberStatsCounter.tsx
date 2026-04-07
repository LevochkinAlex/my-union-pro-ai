"use client";

import { useEffect, useRef, useState } from "react";
import { PLATFORM_STATS } from "@/lib/constants/landing-members";

function useCountUp(end: string, visible: boolean) {
  const [display, setDisplay] = useState(end);
  const numMatch = end.match(/^([\d\s]+)/);

  useEffect(() => {
    if (!visible || !numMatch) return;
    const target = parseInt(numMatch[1].replace(/\s/g, ""), 10);
    if (isNaN(target)) return;

    const suffix = end.slice(numMatch[0].length);
    const duration = 1500;
    const steps = 40;
    const stepTime = duration / steps;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      setDisplay(current.toLocaleString("ru-RU") + suffix);
      if (step >= steps) {
        clearInterval(timer);
        setDisplay(end);
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [visible, end, numMatch]);

  return display;
}

export default function MemberStatsCounter() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {PLATFORM_STATS.map((stat) => (
        <StatItem key={stat.label} stat={stat} visible={visible} />
      ))}
    </div>
  );
}

function StatItem({ stat, visible }: { stat: { value: string; label: string }; visible: boolean }) {
  const display = useCountUp(stat.value, visible);

  return (
    <div className="glass rounded-2xl p-6 text-center transition-all hover:bg-white/10">
      <p className="text-3xl font-bold text-gradient tabular-nums sm:text-4xl">{display}</p>
      <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
    </div>
  );
}
