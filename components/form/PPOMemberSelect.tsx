"use client";

import { useState, useRef, useEffect, useMemo } from "react";

export interface PPOMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  jobTitle?: string | null;
}

interface PPOMemberSelectProps {
  value: string;
  onChange: (id: string, member: PPOMember | null) => void;
  members: PPOMember[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  loading?: boolean;
  /** Показывать должность в списке и в выбранном значении */
  showJobTitle?: boolean;
}

function getMemberFullName(m: PPOMember): string {
  return [m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ");
}

function getMemberLabel(m: PPOMember, showJobTitle: boolean): string {
  const name = getMemberFullName(m);
  if (showJobTitle && m.jobTitle) return `${name} (${m.jobTitle})`;
  return name;
}

export default function PPOMemberSelect({
  value,
  onChange,
  members,
  placeholder = "Поиск по ФИО или должности...",
  disabled = false,
  className = "",
  loading = false,
  showJobTitle = true,
}: PPOMemberSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === value) ?? null,
    [members, value]
  );
  const displayValue = selectedMember
    ? getMemberLabel(selectedMember, showJobTitle)
    : searchQuery;

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter((m) => {
      const name = getMemberFullName(m).toLowerCase();
      const job = (m.jobTitle || "").toLowerCase();
      return name.includes(q) || job.includes(q);
    });
  }, [members, searchQuery]);

  useEffect(() => {
    if (!isOpen) setHighlightedIndex(-1);
    else setHighlightedIndex(filteredMembers.length > 0 ? 0 : -1);
  }, [isOpen, searchQuery, filteredMembers.length]);

  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const el = listRef.current.children[highlightedIndex] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (member: PPOMember) => {
    onChange(member.id, member);
    setSearchQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    onChange("", null);
    setSearchQuery("");
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < filteredMembers.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case "Enter":
        e.preventDefault();
        if (
          highlightedIndex >= 0 &&
          highlightedIndex < filteredMembers.length
        ) {
          handleSelect(filteredMembers[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        if (searchQuery) setSearchQuery("");
        break;
      default:
        break;
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchQuery : displayValue}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || loading}
          className="block w-full rounded-md border-0 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
          autoComplete="off"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-600 dark:hover:text-gray-300"
            title="Очистить"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      {loading && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Загрузка списка...</p>
      )}
      {isOpen && !loading && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700"
        >
          {filteredMembers.length === 0 ? (
            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
              {searchQuery ? "Никого не найдено" : "Нет членов в списке"}
            </div>
          ) : (
            filteredMembers.map((member, index) => (
              <button
                key={member.id}
                type="button"
                onClick={() => handleSelect(member)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`block w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors ${
                  index === highlightedIndex
                    ? "bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200"
                    : "text-gray-900 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-600"
                } ${member.id === value ? "font-medium" : ""}`}
              >
                <div>{getMemberFullName(member)}</div>
                {showJobTitle && member.jobTitle && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {member.jobTitle}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
