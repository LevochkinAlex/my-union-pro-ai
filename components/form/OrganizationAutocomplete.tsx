"use client";

import { useState, useEffect, useRef } from "react";

interface Organization {
  id: string;
  name: string;
  fullPath?: string;
  indentedName?: string;
}

interface OrganizationAutocompleteProps {
  value: string; // organizationId
  onChange: (organizationId: string) => void;
  options: Organization[];
  placeholder?: string;
  className?: string;
  name?: string;
}

export default function OrganizationAutocomplete({
  value,
  onChange,
  options,
  placeholder = "Начните вводить название организации...",
  className = "",
  name,
}: OrganizationAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filteredOptions, setFilteredOptions] = useState<Organization[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [justSelected, setJustSelected] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const [displayValue, setDisplayValue] = useState("");
  const [savedDisplayValue, setSavedDisplayValue] = useState<string>(""); // Сохраняем значение для восстановления
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Находим отображаемое значение для выбранной организации
  // В анкете и профиле показываем только название ППО (name), без полного пути
  useEffect(() => {
    if (value) {
      const selectedOrg = options.find((org) => org.id === value);
      if (selectedOrg) {
        const newDisplayValue = selectedOrg.name;
        setDisplayValue(newDisplayValue);
        setSavedDisplayValue(newDisplayValue); // Сохраняем значение
      } else if (options.length === 0) {
        // Если options еще не загружены, используем сохраненное значение
        if (savedDisplayValue) {
          setDisplayValue(savedDisplayValue);
        }
        // Если сохраненного значения нет, оставляем текущее displayValue
      } else {
        // Только если options загружены, но организация не найдена, сбрасываем
        // Это может произойти, если организация была удалена из справочника
        setDisplayValue("");
        setSavedDisplayValue("");
      }
    } else {
      setDisplayValue("");
      setSavedDisplayValue("");
    }
  }, [value, options]);

  useEffect(() => {
    // Если значение только что выбрано из списка - не открываем dropdown
    if (justSelected) {
      setJustSelected(false);
      return;
    }

    // Фильтруем опции только если пользователь начал вводить текст (уменьшили до 1 символа для более быстрого поиска)
    if (displayValue.trim().length >= 1) {
      const query = displayValue.toLowerCase();

      // Улучшенный поиск: точное совпадение в начале, затем вхождение в середине
      // Также ищем по отдельным словам для лучшего поиска
      const exact: Organization[] = [];
      const startsWith: Organization[] = [];
      const contains: Organization[] = [];
      const wordMatch: Organization[] = [];
      const partialWordMatch: Organization[] = [];

      const queryWords = query.split(/\s+/).filter(w => w.length > 1); // Уменьшили минимальную длину слова до 1

      options.forEach((org) => {
        const displayName = org.name.toLowerCase();
        const nameWords = displayName.split(/\s+/);

        if (displayName === query) {
          exact.push(org);
        } else if (displayName.startsWith(query)) {
          startsWith.push(org);
        } else if (displayName.includes(query)) {
          contains.push(org);
        } else if (queryWords.length > 0) {
          // Поиск по отдельным словам - если все слова запроса есть в названии
          const allWordsMatch = queryWords.every(qw => 
            nameWords.some(nw => nw.startsWith(qw) || nw.includes(qw))
          );
          if (allWordsMatch && !contains.includes(org)) {
            wordMatch.push(org);
          } else if (queryWords.length > 1) {
            // Частичное совпадение - если хотя бы половина слов найдена
            const matchedWords = queryWords.filter(qw => 
              nameWords.some(nw => nw.startsWith(qw) || nw.includes(qw))
            );
            if (matchedWords.length >= Math.ceil(queryWords.length / 2) && !wordMatch.includes(org) && !contains.includes(org)) {
              partialWordMatch.push(org);
            }
          }
        }
      });

      // Объединяем результаты: сначала точные, потом начинающиеся с запроса, потом содержащие, потом по словам, потом частичные
      const filtered = [...exact, ...startsWith, ...contains, ...wordMatch, ...partialWordMatch].slice(0, 30); // Топ-30 результатов

      setFilteredOptions(filtered);
      // Открываем dropdown ТОЛЬКО если пользователь вводит текст
      if (userTyping) {
        setIsOpen(filtered.length > 0);
      }
    } else {
      setFilteredOptions([]);
      setIsOpen(false);
    }
    setHighlightedIndex(-1);
  }, [displayValue, options, justSelected, userTyping]);

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
    setUserTyping(true);
    const newValue = e.target.value;
    setDisplayValue(newValue);
    
    // Если поле очищено, сбрасываем выбранную организацию
    if (!newValue.trim()) {
      onChange("");
    }
  };

  const handleOptionClick = (org: Organization) => {
    onChange(org.id);
    setDisplayValue(org.name);
    setJustSelected(true);
    setUserTyping(false);
    setIsOpen(false);
    inputRef.current?.blur();
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

  const defaultClassName = "w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          // НЕ открываем dropdown автоматически при фокусе
        }}
        onBlur={() => {
          setTimeout(() => setUserTyping(false), 200);
        }}
        placeholder={placeholder}
        className={className || defaultClassName}
        autoComplete="off"
      />

      {isOpen && filteredOptions.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {filteredOptions.map((org, index) => {
            const displayName = org.name;
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => handleOptionClick(org)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`block w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors ${
                  index === highlightedIndex
                    ? "bg-blue-50 text-blue-900 dark:bg-blue-900/20 dark:text-blue-200"
                    : "text-gray-900 hover-surface dark:text-gray-200"
                }`}
              >
                {displayName}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

