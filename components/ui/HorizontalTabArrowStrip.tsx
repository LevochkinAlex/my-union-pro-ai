"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useHorizontalTabArrowScroll } from "@/hooks/useHorizontalTabArrowScroll";

const ARROW_BTN =
  "shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-transparent bg-white/70 text-gray-600 backdrop-blur-md hover:bg-white/90 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset dark:bg-gray-800/70 dark:text-gray-400 dark:hover:bg-gray-700/90 dark:hover:text-white";

/** Только визуал: ширина слотов при overflow не меняется при скролле */
const ARROW_TRANSITION =
  "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none";

const SCROLL_AREA =
  "meeting-tabs-scroll flex min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain -mb-px [-webkit-overflow-scrolling:touch]";

type HorizontalTabArrowStripProps = {
  enabled?: boolean;
  remeasureDeps?: unknown[];
  /** Ряд вкладок: передайте ref на nav или ul с `flex w-max flex-nowrap` */
  children: (innerRef: (node: HTMLElement | null) => void) => ReactNode;
};

export function HorizontalTabArrowStrip({
  enabled = true,
  remeasureDeps = [],
  children,
}: HorizontalTabArrowStripProps) {
  const { scrollRefCallback, innerRefCallback, showLeft, showRight, hasOverflow, scroll, onScroll } =
    useHorizontalTabArrowScroll(enabled, remeasureDeps);

  const showSlots = enabled && hasOverflow;
  const leftActive = showSlots && showLeft;
  const rightActive = showSlots && showRight;

  return (
    <div className="flex items-stretch">
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden",
          showSlots ? "w-10" : "w-0",
        )}
        aria-hidden={!showSlots}
      >
        <button
          type="button"
          onClick={() => scroll("left")}
          className={cn(
            ARROW_BTN,
            ARROW_TRANSITION,
            leftActive
              ? "pointer-events-auto scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0",
          )}
          aria-label="Прокрутить табы влево"
          aria-hidden={!leftActive}
          tabIndex={leftActive ? 0 : -1}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
      <div ref={scrollRefCallback} onScroll={onScroll} className={SCROLL_AREA}>
        {children(innerRefCallback)}
      </div>
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden",
          showSlots ? "w-10" : "w-0",
        )}
        aria-hidden={!showSlots}
      >
        <button
          type="button"
          onClick={() => scroll("right")}
          className={cn(
            ARROW_BTN,
            ARROW_TRANSITION,
            rightActive
              ? "pointer-events-auto scale-100 opacity-100"
              : "pointer-events-none scale-95 opacity-0",
          )}
          aria-label="Прокрутить табы вправо"
          aria-hidden={!rightActive}
          tabIndex={rightActive ? 0 : -1}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
