"use client";
import React, { useRef, useEffect } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
  showCloseButton?: boolean; // New prop to control close button visibility
  isFullscreen?: boolean; // Default to false for backwards compatibility
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
