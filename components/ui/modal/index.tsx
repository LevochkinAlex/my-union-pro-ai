"use client";
import React, { useRef, useEffect, useState } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
}

interface ModalSectionProps {
  children: React.ReactNode;
  className?: string;
  /** Градиент внизу + кнопка «вниз», если контент длиннее области (анкета, длинные формы) */
  scrollHint?: boolean;
}

function joinClasses(...parts: Array<string | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  className,
  showCloseButton = true, // Default to true for backwards compatibility
  isFullscreen = false,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const hasCustomMaxWidth = className?.includes("max-w-");
  const contentClasses = isFullscreen
    ? "w-full h-full"
    : `relative flex min-h-0 flex-col w-full rounded-3xl bg-white dark:bg-gray-900 shadow-xl max-h-[calc(100vh-2rem)] sm:max-h-[85vh] overflow-hidden ${!hasCustomMaxWidth ? "max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-3rem)]" : ""}`;

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-y-auto modal z-99999 p-2 sm:p-4 md:p-6">
      {!isFullscreen && (
        <div
          className="fixed inset-0 h-full w-full bg-black/50 dark:bg-black/70 backdrop-blur-md dark:backdrop-blur-lg"
          onClick={onClose}
        ></div>
      )}
      <div
        ref={modalRef}
        className={`${contentClasses} ${className || ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            title="Закрыть"
            className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100/80 text-gray-500 backdrop-blur-sm transition-colors hover:bg-gray-200 hover:text-gray-800 dark:bg-gray-800/80 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white sm:right-4 sm:top-4"
          >
            <svg className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M6.04289 16.5413C5.65237 16.9318 5.65237 17.565 6.04289 17.9555C6.43342 18.346 7.06658 18.346 7.45711 17.9555L11.9987 13.4139L16.5408 17.956C16.9313 18.3466 17.5645 18.3466 17.955 17.956C18.3455 17.5655 18.3455 16.9323 17.955 16.5418L13.4129 11.9997L17.955 7.4576C18.3455 7.06707 18.3455 6.43391 17.955 6.04338C17.5645 5.65286 16.9313 5.65286 16.5408 6.04338L11.9987 10.5855L7.45711 6.0439C7.06658 5.65338 6.43342 5.65338 6.04289 6.0439C5.65237 6.43442 5.65237 7.06759 6.04289 7.45811L10.5845 11.9997L6.04289 16.5413Z"
                fill="currentColor"
              />
            </svg>
          </button>
        )}
        <div
          className={
            isFullscreen
              ? ""
              : "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          }
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export const ModalHeader: React.FC<ModalSectionProps> = ({ children, className }) => (
  <div
    className={joinClasses(
      "shrink-0 border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900",
      className
    )}
  >
    {children}
  </div>
);

export const ModalBody: React.FC<ModalSectionProps> = ({ children, className, scrollHint }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  useEffect(() => {
    if (!scrollHint) return;
    const root = scrollRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setMoreBelow(!entry.isIntersecting);
      },
      { root, threshold: 0, rootMargin: "0px 0px -4px 0px" }
    );
    const refreshIo = () => {
      io.unobserve(sentinel);
      io.observe(sentinel);
    };
    io.observe(sentinel);

    let roRaf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(roRaf);
      roRaf = requestAnimationFrame(refreshIo);
    });
    ro.observe(root);
    const content = contentRef.current;
    if (content) ro.observe(content);

    const t = window.setTimeout(refreshIo, 300);
    const t2 = window.setTimeout(refreshIo, 900);

    return () => {
      cancelAnimationFrame(roRaf);
      io.disconnect();
      ro.disconnect();
      window.clearTimeout(t);
      window.clearTimeout(t2);
    };
  }, [scrollHint]);

  const scrollDownSmooth = () => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = Math.min(320, Math.max(160, Math.round(el.clientHeight * 0.55)));
    el.scrollBy({ top: delta, behavior: "smooth" });
  };

  if (!scrollHint) {
    return (
      <div className={joinClasses("min-h-0 flex-1 overflow-y-auto px-6 py-4", className)}>
        {children}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className={joinClasses("min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4", className)}
        tabIndex={0}
      >
        <div ref={contentRef} className="min-w-0">
          {children}
        </div>
        <div ref={sentinelRef} className="h-px w-full shrink-0" aria-hidden />
      </div>
      {moreBelow && (
        <>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-14 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-900 dark:via-gray-900/90"
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-2 pt-8">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                scrollDownSmooth();
              }}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-2xl border border-blue-200/90 bg-white/95 px-3 py-2 text-xs font-semibold text-blue-800 shadow-md ring-1 ring-black/5 backdrop-blur-sm transition hover:border-blue-300 hover:bg-blue-50/95 hover:shadow-lg active:scale-[0.98] dark:border-blue-700/70 dark:bg-gray-800/95 dark:text-blue-200 dark:ring-white/10 dark:hover:border-blue-600 dark:hover:bg-gray-700/90"
              aria-label="Ниже ещё содержимое, прокрутить вниз"
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                <svg
                  className="block size-4 text-blue-600 motion-safe:animate-bounce dark:text-blue-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </span>
              <span className="flex min-h-4 items-center select-none leading-none">Ещё ниже</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export const ModalFooter: React.FC<ModalSectionProps> = ({ children, className }) => (
  <div
    className={joinClasses(
      "shrink-0 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-900",
      className
    )}
  >
    {children}
  </div>
);
