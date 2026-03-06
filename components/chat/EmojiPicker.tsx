"use client";

import { useState, useRef, useEffect } from "react";
import {
  Eye,
  Flame,
  Frown,
  Hand,
  Heart,
  Laugh,
  PartyPopper,
  ThumbsUp,
} from "lucide-react";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  defaultEmoji?: string;
  showButton?: boolean; // Показывать ли кнопку для открытия
  isOpen?: boolean; // Контролируемое состояние открытия
  onOpenChange?: (isOpen: boolean) => void; // Callback при изменении состояния
}

const REACTION_OPTIONS = [
  { value: "\u{1F44D}", label: "Нравится", icon: ThumbsUp },
  { value: "\u{2764}\u{FE0F}", label: "Любовь", icon: Heart },
  { value: "\u{1F602}", label: "Смешно", icon: Laugh },
  { value: "\u{1F62E}", label: "Удивление", icon: Eye },
  { value: "\u{1F622}", label: "Грусть", icon: Frown },
  { value: "\u{1F389}", label: "Праздник", icon: PartyPopper },
  { value: "\u{1F44F}", label: "Поддержка", icon: Hand },
  { value: "\u{1F525}", label: "Огонь", icon: Flame },
] as const;

export default function EmojiPicker({ 
  onEmojiSelect, 
  defaultEmoji, 
  showButton = true,
  isOpen: controlledIsOpen,
  onOpenChange
}: EmojiPickerProps) {
  // Получаем сохраненный эмодзи из localStorage
  const getSavedEmoji = (): string => {
    if (typeof window === "undefined") return REACTION_OPTIONS[0].value;
    const saved = localStorage.getItem("lastSelectedEmoji");
    return saved || defaultEmoji || REACTION_OPTIONS[0].value;
  };

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringRef = useRef(false);
  
  // Используем контролируемое или внутреннее состояние
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  
  const setIsOpen = (value: boolean) => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (controlledIsOpen === undefined) {
      setInternalIsOpen(value);
    }
    onOpenChange?.(value);
  };

  const handleMouseEnter = () => {
    isHoveringRef.current = true;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    isHoveringRef.current = false;
    // Задержка перед закрытием, чтобы пользователь мог переместить курсор к модалке
    closeTimeoutRef.current = setTimeout(() => {
      if (!isHoveringRef.current) {
        setIsOpen(false);
      }
    }, 300);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (closeTimeoutRef.current) {
        clearTimeout(closeTimeoutRef.current);
      }
    };
  }, [isOpen]);

  const handleEmojiClick = (emoji: string) => {
    // Сохраняем выбранный эмодзи в localStorage
    if (typeof window !== "undefined") {
      localStorage.setItem("lastSelectedEmoji", emoji);
    }
    onEmojiSelect(emoji);
    setIsOpen(false);
  };

  useEffect(() => {
    // touch saved reaction once to keep compatibility
    getSavedEmoji();
  }, []);

  return (
    <div 
      className="relative" 
      ref={pickerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {showButton && (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          onMouseEnter={handleMouseEnter}
          className="p-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors flex items-center justify-center"
          title="Выбрать эмодзи"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div 
          className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-3 w-80 max-h-96 overflow-hidden flex flex-col z-50"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="mb-2 border-b border-gray-200 pb-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            Выберите реакцию
          </div>

          <div className="grid flex-1 grid-cols-4 gap-2 overflow-y-auto">
            {REACTION_OPTIONS.map((reaction) => {
              const Icon = reaction.icon;
              return (
              <button
                key={reaction.value}
                type="button"
                onClick={() => handleEmojiClick(reaction.value)}
                className="flex flex-col items-center justify-center gap-1 rounded border border-gray-200 p-2 transition-colors hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-700"
                title={reaction.label}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[10px] text-gray-600 dark:text-gray-300">{reaction.label}</span>
              </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

