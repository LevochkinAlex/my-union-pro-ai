"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Горизонтальный скролл ряда вкладок + показ круглых стрелок влево/вправо.
 * Замер ширины по внутреннему узлу (nav/ul), чтобы индикаторы корректно появлялись после layout.
 */
export function useHorizontalTabArrowScroll(enabled: boolean, remeasureDeps: unknown[] = []) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLElement | null>(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  const depsKey = JSON.stringify(remeasureDeps);

  const updateHints = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const inner = innerRef.current;
    const contentWidth = inner ? Math.max(inner.scrollWidth, inner.offsetWidth) : el.scrollWidth;
    const viewWidth = el.clientWidth;
    const maxScroll = Math.max(0, contentWidth - viewWidth);
    const sl = el.scrollLeft;

    if (!enabled) {
      setHasOverflow(false);
      setShowLeft(false);
      setShowRight(false);
      return;
    }

    const overflow = maxScroll > 2;
    setHasOverflow(overflow);
    setShowLeft(overflow && sl > 2);
    setShowRight(overflow && sl < maxScroll - 2);
  }, [enabled]);

  const innerRefCallback = useCallback(
    (node: HTMLElement | null) => {
      innerRef.current = node;
      if (!node) return;
      const run = () => updateHints();
      run();
      queueMicrotask(run);
      requestAnimationFrame(run);
      requestAnimationFrame(() => requestAnimationFrame(run));
      [0, 50, 150, 400].forEach((ms) => window.setTimeout(run, ms));
      if (typeof document !== "undefined" && document.fonts?.ready) {
        void document.fonts.ready.then(run);
      }
    },
    [updateHints],
  );

  const scrollRefCallback = useCallback(
    (node: HTMLDivElement | null) => {
      scrollRef.current = node;
      if (!node) return;
      const run = () => updateHints();
      run();
      queueMicrotask(run);
      requestAnimationFrame(run);
      [0, 80, 200].forEach((ms) => window.setTimeout(run, ms));
    },
    [updateHints],
  );

  const scroll = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const step = Math.max(200, el.clientWidth * 0.6);
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
  }, []);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;
    updateHints();
    const id = requestAnimationFrame(() => {
      updateHints();
      requestAnimationFrame(updateHints);
    });
    return () => cancelAnimationFrame(id);
  }, [enabled, updateHints, depsKey]);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el) return;

    updateHints();
    el.addEventListener("scroll", updateHints, { passive: true });
    const ro = new ResizeObserver(() => updateHints());
    ro.observe(el);
    if (inner) ro.observe(inner);
    window.addEventListener("resize", updateHints);

    const poll = window.setInterval(updateHints, 250);
    const stopPoll = window.setTimeout(() => clearInterval(poll), 3500);

    return () => {
      clearInterval(poll);
      clearTimeout(stopPoll);
      el.removeEventListener("scroll", updateHints);
      ro.disconnect();
      window.removeEventListener("resize", updateHints);
    };
  }, [enabled, updateHints, depsKey]);

  return {
    scrollRefCallback,
    innerRefCallback,
    showLeft,
    showRight,
    hasOverflow,
    scroll,
    onScroll: updateHints,
  };
}
