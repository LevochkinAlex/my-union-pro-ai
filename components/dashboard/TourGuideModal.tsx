"use client";

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import {
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  setTourDismissed,
  type TourStep,
} from "@/lib/tour-guide-steps";

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

interface TourGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Начальный шаг (0-based). По умолчанию 0. */
  initialStep?: number;
  /** Демо-режим: «больше не показывать» сохраняется отдельно от обычного аккаунта. */
  isDemo?: boolean;
}

export default function TourGuideModal({
  isOpen,
  onClose,
  initialStep = 0,
  isDemo = false,
}: TourGuideModalProps) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(Math.min(initialStep, TOUR_STEPS.length - 1));
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const step: TourStep = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

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
  }, [stepIndex, isLast, handleClose, router]);

  const handleBack = useCallback(() => {
    if (isFirst) return;
    setStepIndex((i) => Math.max(0, i - 1));
  }, [isFirst]);

  if (!step) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} showCloseButton={true}>
      <div className="relative overflow-hidden rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 via-blue-50/50 to-purple-50 p-6 shadow-lg dark:border-blue-900/50 dark:from-blue-900/20 dark:via-blue-900/10 dark:to-purple-900/20 sm:p-8">
        {/* Декоративные блики в стиле MembershipBanner */}
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/20" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-32 w-32 rounded-full bg-purple-200/30 blur-2xl dark:bg-purple-500/20" />

        <div className="relative max-h-[70vh] flex flex-col">
          {/* Индикатор шага */}
          <div className="mb-4 flex items-center justify-center gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setStepIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === stepIndex
                    ? "w-6 bg-blue-600 dark:bg-blue-500"
                    : "w-2 bg-blue-200 dark:bg-blue-800 hover:bg-blue-300 dark:hover:bg-blue-700"
                }`}
                aria-label={`Шаг ${i + 1}`}
              />
            ))}
          </div>

          {/* Заголовок с иконкой */}
          <div className="mb-3 flex items-center gap-3">
            {step.icon && (
              <span className="flex h-10 w-10 min-h-10 min-w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-xl text-white dark:bg-blue-500">
                {step.icon}
              </span>
            )}
            <h2 className="text-xl font-bold text-gray-900 dark:text-white sm:text-2xl">
              {step.title}
            </h2>
          </div>

          {/* Текст шага */}
          <div className="mb-4 flex-1 overflow-y-auto text-sm leading-relaxed text-gray-700 dark:text-gray-300 sm:text-base">
            <p className="whitespace-pre-wrap">{renderContent(step.content)}</p>
            {step.sidebarHint && (
              <p className="mt-3 rounded-lg bg-blue-100/80 px-3 py-2 text-xs text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                💡 {step.sidebarHint}
              </p>
            )}
          </div>

          {/* Чекбокс «Больше не показывать» */}
          <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700"
            />
            <span>Больше не показывать этот тур</span>
          </label>

          {/* Кнопки */}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-3">
            <div className="flex gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Назад
                </button>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Закрыть
              </button>
            </div>
            <button
              type="button"
              onClick={handleNext}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              {isLast ? "Готово" : "Далее"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export { TOUR_STORAGE_KEY };
