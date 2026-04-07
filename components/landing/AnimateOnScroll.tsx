"use client";

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** "fade-up" | "scale" */
  variant?: "fade-up" | "scale";
}

export default function AnimateOnScroll({
  children,
  className = "",
  delay = 0,
  variant = "fade-up",
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("mk-visible");
          obs.unobserve(el);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const base = variant === "scale" ? "mk-scale" : "mk-animate";
  const delayClass = delay > 0 ? `mk-animate-delay-${delay}` : "";

  return (
    <div ref={ref} className={`${base} ${delayClass} ${className}`}>
      {children}
    </div>
  );
}
