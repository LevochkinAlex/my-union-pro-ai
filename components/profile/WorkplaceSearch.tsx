"use client";

import { useState, useEffect, useRef } from "react";
import { CompanySuggestion } from "@/lib/dadata";

interface WorkplaceSearchProps {
  value?: {
    name: string;
    inn: string;
    directorName: string;
    directorPosition: string;
  } | null;
  onChange: (workplace: {
    name: string;
    inn: string;
    directorName: string;
    directorPosition: string;
  } | null) => void;
  required?: boolean;
  error?: string;
}

export default function WorkplaceSearch({
  value,
  onChange,
  required = false,
  error,
}: WorkplaceSearchProps) {
  const [query, setQuery] = useState(value?.name || "");
  const [suggestions, setSuggestions] = useState<CompanySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isFocused, setIsFocused] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Синхронизируем query с value при изменении value извне (но не открываем dropdown)
  useEffect(() => {
    if (value?.name && value.name !== query) {
      setQuery(value.name);
      setIsOpen(false); // Гарантируем, что dropdown закрыт
      setIsFocused(false); // Гарантируем, что поле не в фокусе
    } else if (!value && query) {
      // Если value был очищен, очищаем и query
      setQuery("");
      setIsOpen(false);
      setIsFocused(false);
    }
  }, [value?.name]); // Только при изменении value.name, не query

  // При монтировании компонента гарантируем, что dropdown закрыт
  useEffect(() => {
    setIsOpen(false);
    setIsFocused(false);
  }, []);

  // Закрываем список при клике вне компонента
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
        // Убираем фокус с инпута, если он был в фокусе
        if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Поиск компаний при изменении запроса (только если поле в фокусе)
  useEffect(() => {
    // Не выполняем поиск, если поле не в фокусе
    if (!isFocused) {
      return;
    }

    if (!query || query.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    // Если query совпадает с уже выбранным значением, не показываем dropdown
    if (value && query === value.name) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/dadata/companies?query=${encodeURIComponent(query)}`);
        if (response.ok) {
          const data = await response.json();
          setSuggestions(data.suggestions || []);
          // Открываем только если есть результаты и инпут все еще в фокусе
          if (data.suggestions && data.suggestions.length > 0 && isFocused) {
            setIsOpen(true);
          } else {
            setIsOpen(false);
          }
          setSelectedIndex(-1);
        }
      } catch (error) {
        console.error("Error searching companies:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300); // Debounce 300ms

    return () => clearTimeout(timeoutId);
  }, [query, value, isFocused]);

  const handleSelect = (suggestion: CompanySuggestion) => {
    const { data } = suggestion;
    
    // Формируем данные о месте работы
    const workplace = {
      name: data.name.short || data.name.full,
      inn: data.inn,
      directorName: data.management?.name || "",
      directorPosition: data.management?.post || "",
    };

    setQuery(workplace.name);
    onChange(workplace);
    setIsOpen(false);
    setSuggestions([]);
    setIsFocused(false);
    // Убираем фокус с инпута после выбора
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setQuery("");
    onChange(null);
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < suggestions.length) {
          handleSelect(suggestions[selectedIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Место работы {required && <span className="text-red-500">*</span>}
      </label>
      
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            setIsFocused(true);
            // Открываем dropdown только если есть suggestions И текущий query НЕ совпадает с выбранным значением
            if (suggestions.length > 0 && (!value || query !== value.name)) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            // Не закрываем сразу, чтобы можно было кликнуть на элемент в dropdown
            // Закроется через handleClickOutside
            setTimeout(() => {
              if (document.activeElement !== inputRef.current && !wrapperRef.current?.contains(document.activeElement)) {
                setIsFocused(false);
              }
            }, 200);
          }}
          placeholder="Введите название компании или ИНН"
          className={`block w-full rounded-lg border ${
            error ? "border-red-500" : "border-gray-300"
          } bg-white px-3 py-2.5 pr-10 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white`}
          required={required}
        />
        
        {/* Кнопка очистки */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        {/* Индикатор загрузки */}
        {isLoading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>

      {/* Список подсказок */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.data.inn}
              type="button"
              onClick={() => handleSelect(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full text-left px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors ${
                index === selectedIndex ? "bg-gray-100 dark:bg-gray-700" : ""
              }`}
            >
              <div className="font-medium text-gray-900 dark:text-white">
                {suggestion.data.name.short || suggestion.data.name.full}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                ИНН: {suggestion.data.inn}
              </div>
              {suggestion.data.management && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {suggestion.data.management.post}: {suggestion.data.management.name}
                </div>
              )}
              {suggestion.data.address && (
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                  {suggestion.data.address.value}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Сообщение об ошибке */}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Информация о выбранной компании */}
      {value && value.directorName && (
        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-sm text-gray-700 dark:text-gray-300">
            <div className="font-medium mb-1">Руководитель организации:</div>
            <div>{value.directorPosition}: {value.directorName}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              ИНН: {value.inn}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

