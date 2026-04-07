"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

const SLIDES = [
  {
    src: "/Landing/Screenshot 2026-02-28 at 11.25.24 2.png",
    alt: "MyUnion Pro — главная панель",
  },
  {
    src: "/Landing/Screenshot 2026-02-28 at 11.25.24 3.png",
    alt: "MyUnion Pro — управление членами",
  },
  {
    src: "/Landing/Screenshot 2026-02-28 at 11.25.24 5.png",
    alt: "MyUnion Pro — панель управления профсоюзом",
  },
  {
    src: "/Landing/Screenshot 2026-02-28 at 11.25.24 6.png",
    alt: "MyUnion Pro — документооборот",
  },
  {
    src: "/Landing/Screenshot 2026-02-28 at 11.25.24 7.png",
    alt: "MyUnion Pro — обращения и чаты",
  },
];

export default function ScreenshotCarousel() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  function scrollTo(idx: number) {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[idx] as HTMLElement | undefined;
    if (child) {
      track.scrollTo({ left: child.offsetLeft - track.offsetLeft, behavior: "smooth" });
    }
  }

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % SLIDES.length;
        scrollTo(next);
        return next;
      });
    }, 5000);
    return () => clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const handler = () => {
      const scrollLeft = track.scrollLeft;
      const width = track.offsetWidth;
      const idx = Math.round(scrollLeft / width);
      setActive(Math.min(idx, SLIDES.length - 1));
    };
    track.addEventListener("scrollend", handler);
    return () => track.removeEventListener("scrollend", handler);
  }, []);

  function handleDotClick(idx: number) {
    clearInterval(timerRef.current);
    setActive(idx);
    scrollTo(idx);
    timerRef.current = setInterval(() => {
      setActive((prev) => {
        const next = (prev + 1) % SLIDES.length;
        scrollTo(next);
        return next;
      });
    }, 5000);
  }

  return (
    <div className="relative mx-auto max-w-5xl">
      <div
        ref={trackRef}
        className="carousel-track flex gap-6 overflow-x-auto pb-4 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {SLIDES.map((slide, i) => (
          <div
            key={i}
            className="relative min-w-full overflow-hidden rounded-2xl glass p-2 sm:p-3"
          >
            <div className="overflow-hidden rounded-xl h-fit">
              <Image
                src={slide.src}
                alt={slide.alt}
                width={1280}
                height={800}
                className="w-full h-auto object-cover"
                quality={90}
                priority={i === 0}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="mt-4 flex justify-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleDotClick(i)}
            aria-label={`Слайд ${i + 1}`}
            className={`h-2.5 rounded-full transition-all duration-300 ${
              active === i
                ? "w-8 bg-primary"
                : "w-2.5 bg-foreground/20 hover:bg-foreground/40"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
