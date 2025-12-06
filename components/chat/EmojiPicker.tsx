"use client";

import { useState, useRef, useEffect } from "react";

interface EmojiPickerProps {
  onEmojiSelect: (emoji: string) => void;
  defaultEmoji?: string;
  showButton?: boolean; // Показывать ли кнопку для открытия
  isOpen?: boolean; // Контролируемое состояние открытия
  onOpenChange?: (isOpen: boolean) => void; // Callback при изменении состояния
}

const EMOJI_CATEGORIES = {
  recent: ["❤️", "👍", "😊", "😂", "😍", "🙏", "🔥", "💯"],
  smileys: ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔"],
  gestures: ["👋", "🤚", "🖐", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏"],
  hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟"],
  objects: ["🔥", "💯", "⭐", "🌟", "✨", "💫", "💥", "💢", "💤", "💨", "🎉", "🎊", "🎈", "🎁", "🏆", "🥇", "🥈", "🥉"],
};

export default function EmojiPicker({ 
  onEmojiSelect, 
  defaultEmoji, 
  showButton = true,
  isOpen: controlledIsOpen,
  onOpenChange
}: EmojiPickerProps) {
  // Получаем сохраненный эмодзи из localStorage
  const getSavedEmoji = (): string => {
    if (typeof window === "undefined") return "❤️";
    const saved = localStorage.getItem("lastSelectedEmoji");
    return saved || defaultEmoji || "❤️";
  };

  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<keyof typeof EMOJI_CATEGORIES>("recent");
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

  // Добавляем кнопку быстрого выбора последнего эмодзи в категорию recent
  useEffect(() => {
    const savedEmoji = getSavedEmoji();
    if (savedEmoji && !EMOJI_CATEGORIES.recent.includes(savedEmoji)) {
      EMOJI_CATEGORIES.recent = [savedEmoji, ...EMOJI_CATEGORIES.recent.filter(e => e !== savedEmoji)].slice(0, 8);
    }
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
          {/* Категории */}
          <div className="flex gap-1 mb-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            {Object.keys(EMOJI_CATEGORIES).map((category) => (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category as keyof typeof EMOJI_CATEGORIES)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  activeCategory === category
                    ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
              >
                {category === "recent" ? "⭐" : category === "smileys" ? "😀" : category === "gestures" ? "👋" : category === "hearts" ? "❤️" : "🔥"}
              </button>
            ))}
          </div>

          {/* Эмодзи */}
          <div className="flex-1 overflow-y-auto grid grid-cols-8 gap-1">
            {EMOJI_CATEGORIES[activeCategory].map((emoji, index) => (
              <button
                key={`${activeCategory}-${index}`}
                type="button"
                onClick={() => handleEmojiClick(emoji)}
                className="p-2 text-xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

