"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Lightbulb } from "lucide-react";
import {
  TOUR_STEPS,
  setTourDismissed,
  type TourStep,
} from "@/lib/tour-guide-steps";
import styles from "./TourGuideSpotlight.module.css";

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_OFFSET = 12;
const Z_OVERLAY = 99998;
const Z_TOOLTIP = 99999;

/** Рендер текста с поддержкой **жирного** */
function renderContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let key = 0;
  let lastIndex = 0;
  const regex = /\*\*([^*]+)\*\*/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(<strong key={key++}>{match[1]}</strong>);
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  if (parts.length === 0) return text;
  return <>{parts}</>;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TourGuideSpotlightProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: number;
  isDemo?: boolean;
}

export default function TourGuideSpotlight({
  isOpen,
  onClose,
  initialStep = 0,
  isDemo = false,
}: TourGuideSpotlightProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [stepIndex, setStepIndex] = useState(Math.min(initialStep, TOUR_STEPS.length - 1));
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const updateRef = useRef<() => void>(() => {});
  const spotlightVarsRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const step: TourStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const updateTargetRect = useCallback(() => {
    if (typeof window === "undefined" || !step?.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setTargetRect({
      top: r.top - SPOTLIGHT_PADDING,
      left: r.left - SPOTLIGHT_PADDING,
      width: r.width + SPOTLIGHT_PADDING * 2,
      height: r.height + SPOTLIGHT_PADDING * 2,
    });
  }, [step?.targetSelector]);

  const updateTooltipPosition = useCallback(() => {
    const placement = step?.tooltipPlacement ?? "bottom";
    if (!targetRect) {
      setTooltipStyle({
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        maxWidth: "min(420px, calc(100vw - 32px))",
        zIndex: Z_TOOLTIP,
      });
      return;
    }
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    const cardMaxWidth = 380;
    const cardMaxHeight = 320;
    let top = 0;
    let left = targetRect.left + SPOTLIGHT_PADDING;
    if (placement === "bottom") {
      top = targetRect.top + targetRect.height + TOOLTIP_OFFSET;
      left = Math.max(16, Math.min(targetRect.left, vw - cardMaxWidth - 16));
    } else if (placement === "top") {
      top = targetRect.top - TOOLTIP_OFFSET - cardMaxHeight;
      left = Math.max(16, Math.min(targetRect.left, vw - cardMaxWidth - 16));
    } else if (placement === "right") {
      top = targetRect.top + SPOTLIGHT_PADDING;
      left = targetRect.left + targetRect.width + TOOLTIP_OFFSET;
    } else if (placement === "left") {
      top = targetRect.top + SPOTLIGHT_PADDING;
      left = targetRect.left - cardMaxWidth - TOOLTIP_OFFSET;
    }
    setTooltipStyle({
      position: "fixed",
      top: Math.max(16, Math.min(top, vh - cardMaxHeight - 16)),
      left: Math.max(16, Math.min(left, vw - cardMaxWidth - 16)),
      transform: "none",
      maxWidth: `${cardMaxWidth}px`,
      maxHeight: `${cardMaxHeight}px`,
      zIndex: Z_TOOLTIP,
    });
  }, [step?.tooltipPlacement, targetRect]);

  updateRef.current = () => {
    updateTargetRect();
  };

  useEffect(() => {
    if (!isOpen) return;
    const run = () => {
      updateRef.current();
    };
    run();
    const t = setTimeout(run, 100);
    const t2 = setTimeout(run, 400);
    window.addEventListener("resize", run);
    window.addEventListener("scroll", run, true);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      window.removeEventListener("resize", run);
      window.removeEventListener("scroll", run, true);
    };
  }, [isOpen, stepIndex, pathname, updateTargetRect]);

  useEffect(() => {
    if (!isOpen) return;
    updateTooltipPosition();
  }, [isOpen, targetRect, step?.tooltipPlacement, updateTooltipPosition]);

  /* Set spotlight CSS variables on wrapper (avoids inline style attribute) */
  useEffect(() => {
    const el = spotlightVarsRef.current;
    if (!el || !targetRect) return;
    el.style.setProperty("--rect-top", `${targetRect.top}px`);
    el.style.setProperty("--rect-left", `${targetRect.left}px`);
    el.style.setProperty("--rect-width", `${targetRect.width}px`);
    el.style.setProperty("--rect-height", `${targetRect.height}px`);
    el.style.setProperty("--mask-top-h", `${Math.max(0, targetRect.top)}px`);
    el.style.setProperty("--mask-left-w", `${Math.max(0, targetRect.left)}px`);
  }, [targetRect]);

  /* Set tooltip CSS variables (avoids inline style attribute) */
  useEffect(() => {
    const el = tooltipRef.current;
    if (!el) return;
    const s = tooltipStyle as Record<string, string | number | undefined>;
    const toCssValue = (value: string | number | undefined, fallback: string): string => {
      if (value === undefined) return fallback;
      return typeof value === "number" ? `${value}px` : value;
    };
    el.style.setProperty("--tooltip-top", s.top !== undefined ? `${s.top}px` : "auto");
    el.style.setProperty("--tooltip-bottom", s.bottom !== undefined ? `${s.bottom}px` : "auto");
    el.style.setProperty("--tooltip-left", typeof s.left === "number" ? `${s.left}px` : (s.left ?? "50%"));
    el.style.setProperty("--tooltip-transform", (s.transform as string) ?? "translateX(-50%)");
    el.style.setProperty("--tooltip-max-width", toCssValue(s.maxWidth, "min(420px, calc(100vw - 32px))"));
    el.style.setProperty("--tooltip-max-height", toCssValue(s.maxHeight, "320px"));
  }, [tooltipStyle]);

  const handleClose = useCallback(() => {
    if (dontShowAgain) {
      setTourDismissed(true, isDemo);
    }
    onClose();
  }, [dontShowAgain, onClose, isDemo]);

  const handleNext = useCallback(() => {
    if (isLast) {
      handleClose();
      return;
    }
    const nextIndex = stepIndex + 1;
    setStepIndex(nextIndex);
    const nextStep = TOUR_STEPS[nextIndex];
    if (nextStep?.targetRoute) {
      router.push(nextStep.targetRoute);
    }
    setTimeout(updateRef.current, 300);
  }, [stepIndex, isLast, handleClose, router]);

  const handleBack = useCallback(() => {
    if (isFirst) return;
    setStepIndex((i) => Math.max(0, i - 1));
  }, [isFirst]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (isOpen) window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, handleClose]);

  if (!isOpen || !step) return null;

  return (
    <div className={`fixed inset-0 pointer-events-none ${styles.overlay}`}>
      {/* Затемнение: 4 панели вокруг «выреза» (элемент остаётся в foreground) */}
      {targetRect && (
        <div ref={spotlightVarsRef}>
          <div
            className={`bg-black/60 pointer-events-auto ${styles.maskTop}`}
            onClick={handleClose}
            aria-hidden
          />
          <div
            className={`bg-black/60 pointer-events-auto ${styles.maskLeft}`}
            onClick={handleClose}
            aria-hidden
          />
          <div
            className={`bg-black/60 pointer-events-auto ${styles.maskRight}`}
            onClick={handleClose}
            aria-hidden
          />
          <div
            className={`bg-black/60 pointer-events-auto ${styles.maskBottom}`}
            onClick={handleClose}
            aria-hidden
          />
          {/* Рамка подсветки вокруг элемента (элемент остаётся в foreground) */}
          <div
            className={`pointer-events-none rounded-xl border-2 border-blue-500 ring-2 ring-blue-400/50 dark:ring-blue-500/50 ${styles.highlight}`}
            aria-hidden
          />
        </div>
      )}

      {/* Карточка-подсказка рядом с элементом (или внизу по центру) */}
      <div
        ref={tooltipRef}
        className={`pointer-events-auto flex flex-col rounded-xl border border-blue-200 bg-white shadow-xl dark:border-blue-900/50 dark:bg-gray-900 overflow-hidden ${styles.tooltip}`}
      >
        <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-blue-50/50 to-purple-50 p-4 shadow-lg dark:border-blue-900/50 dark:from-blue-900/20 dark:via-blue-900/10 dark:to-purple-900/20">
          <div className="flex items-center justify-center gap-1.5 mb-3">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStepIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex
                    ? "w-5 bg-blue-600 dark:bg-blue-500"
                    : "w-1.5 bg-blue-200 dark:bg-blue-800 hover:bg-blue-300 dark:hover:bg-blue-700"
                }`}
                aria-label={`Шаг ${i + 1}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mb-2">
            {step.icon && (
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg text-white dark:bg-blue-500">
                {step.icon}
              </span>
            )}
            <h2 className="text-base font-bold text-gray-900 dark:text-white truncate">
              {step.title}
            </h2>
          </div>
          <div className="text-sm leading-relaxed text-gray-700 dark:text-gray-300 overflow-y-auto max-h-32 mb-3">
            <p className="whitespace-pre-wrap">{renderContent(step.content)}</p>
            {step.sidebarHint && (
              <p className="mt-2 rounded-lg bg-blue-100/80 px-2 py-1.5 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                <span className="inline-flex items-center gap-1"><Lightbulb className="h-3.5 w-3.5 shrink-0" /> {step.sidebarHint}</span>
              </p>
            )}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-3">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
            <span>Больше не показывать</span>
          </label>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={handleBack}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Назад
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Закрыть
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isLast ? "Готово" : "Далее"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
