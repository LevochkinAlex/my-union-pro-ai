"use client";

import { useState, useEffect, useRef } from "react";

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  name?: string;
}

export default function Autocomplete({
  value,
  onChange,
  options,
  placeholder = "",
  className = "",
  name,
}: AutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [justSelected, setJustSelected] = useState(false); // Флаг что значение только что выбрано
  const [userTyping, setUserTyping] = useState(false); // Флаг что пользователь вводит текст
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Если значение только что выбрано из списка - не открываем dropdown
    if (justSelected) {
      setJustSelected(false);
      return;
    }

    // Фильтруем опции
    if (value.trim().length >= 1) {
      const query = value.toLowerCase();
      
      // Улучшенный поиск: точное совпадение в начале, затем вхождение в середине
      const exact: string[] = [];
      const startsWith: string[] = [];
      const contains: string[] = [];
      
      options.forEach((option) => {
        const optionLower = option.toLowerCase();
        
        if (optionLower === query) {
          exact.push(option);
        } else if (optionLower.startsWith(query)) {
          startsWith.push(option);
        } else if (optionLower.includes(query)) {
          contains.push(option);
        }
      });
      
      // Объединяем результаты: сначала точные, потом начинающиеся с запроса, потом содержащие
      const filtered = [...exact, ...startsWith, ...contains].slice(0, 10); // Топ-10 результатов
      
      setFilteredOptions(filtered);
      // Открываем dropdown если есть результаты и (пользователь вводит текст или поле в фокусе или есть совпадения)
      if (filtered.length > 0) {
        // Всегда показываем dropdown если есть результаты и поле в фокусе или пользователь вводит
        if (userTyping || document.activeElement === inputRef.current) {
          setIsOpen(true);
        } else if (value.trim().length > 0) {
          // Если есть текст, но фокус потерян - не показываем
          setIsOpen(false);
        }
      } else {
        setIsOpen(false);
      }
    } else {
      setFilteredOptions([]);
      setIsOpen(false);
    }
    setHighlightedIndex(-1);
  }, [value, options, justSelected, userTyping]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(event.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUserTyping(true); // Пользователь начал вводить текст
    onChange(e.target.value);
  };

  const handleOptionClick = (option: string) => {
    onChange(option);
    setJustSelected(true); // Устанавливаем флаг что значение выбрано
    setUserTyping(false); // Сбрасываем флаг ввода
    setIsOpen(false);
    inputRef.current?.blur(); // Убираем фокус чтобы закрыть dropdown
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredOptions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          handleOptionClick(filteredOptions[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          // Открываем dropdown при фокусе, если есть значение или начинаем вводить
          setUserTyping(true); // Устанавливаем флаг при фокусе
          if (value.trim().length >= 1) {
            const query = value.toLowerCase();
            const exact: string[] = [];
            const startsWith: string[] = [];
            const contains: string[] = [];
            
            options.forEach((option) => {
              const optionLower = option.toLowerCase();
              if (optionLower === query) {
                exact.push(option);
              } else if (optionLower.startsWith(query)) {
                startsWith.push(option);
              } else if (optionLower.includes(query)) {
                contains.push(option);
              }
            });
            
            const filtered = [...exact, ...startsWith, ...contains].slice(0, 10);
            if (filtered.length > 0) {
              setFilteredOptions(filtered);
              setIsOpen(true);
            }
          } else {
            // Если поле пустое, показываем все опции при фокусе
            const allOptions = options.slice(0, 10);
            if (allOptions.length > 0) {
              setFilteredOptions(allOptions);
              setIsOpen(true);
            }
          }
        }}
        onBlur={() => {
          // Сбрасываем флаг ввода при потере фокуса
          setTimeout(() => setUserTyping(false), 200); // Небольшая задержка для обработки клика по опции
        }}
        placeholder={placeholder}
        className={className || "w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"}
        autoComplete="off"
      />

      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
          style={{
            // Явное позиционирование от начала поля
            marginLeft: 0,
          }}
        >
          {filteredOptions.map((option, index) => (
            <button
              key={option}
              type="button"
              onClick={() => handleOptionClick(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`block w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors ${
                index === highlightedIndex
                  ? "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200"
                  : "text-gray-900 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

