"use client";

import { useState, useRef, useEffect, useCallback } from "react";

export interface PPOMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  jobTitle?: string | null;
}

interface PPOMemberMultiSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Минимум символов для поиска (0 = при фокусе грузим первые N) */
  minSearchLength?: number;
  fetchLimit?: number;
}

function getMemberFullName(m: PPOMember): string {
  return [m.lastName, m.firstName, m.middleName].filter(Boolean).join(" ");
}

const DEBOUNCE_MS = 300;
const DEFAULT_LIMIT = 50;

export default function PPOMemberMultiSelect({
  value,
  onChange,
  placeholder = "Поиск по ФИО или должности...",
  disabled = false,
  className = "",
  minSearchLength = 0,
  fetchLimit = DEFAULT_LIMIT,
}: PPOMemberMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [members, setMembers] = useState<PPOMember[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchMembers = useCallback(
    async (q: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          status: "approved",
          limit: String(fetchLimit),
          skip: "0",
        });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`/api/ppo-head/members?${params}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        setMembers(data.members || []);
        setTotal(data.total ?? data.members?.length ?? 0);
      } catch (e) {
        console.error("PPOMemberMultiSelect fetch:", e);
        setMembers([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [fetchLimit]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchMembers(searchQuery);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [isOpen, searchQuery, fetchMembers]);

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

  const toggle = (memberId: string) => {
    if (value.includes(memberId)) {
      onChange(value.filter((id) => id !== memberId));
    } else {
      onChange([...value, memberId]);
    }
  };

  const selectAllInList = () => {
    const ids = new Set(value);
    members.forEach((m) => ids.add(m.id));
    onChange(Array.from(ids));
  };

  const clearAllInList = () => {
    const inList = new Set(members.map((m) => m.id));
    onChange(value.filter((id) => !inList.has(id)));
  };

  const hasMore = total > members.length;

  return (
    <div className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder:text-gray-400"
        autoComplete="off"
      />
      {isOpen && (
        <div
          ref={listRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-700"
        >
          {loading ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Загрузка...
            </div>
          ) : members.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {searchQuery.trim().length < (minSearchLength || 1)
                ? "Введите ФИО или должность для поиска"
                : "Никого не найдено"}
            </div>
          ) : (
            <>
              <div className="sticky top-0 flex gap-2 border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800">
                <button
                  type="button"
                  onClick={selectAllInList}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  Выбрать всех из списка
                </button>
                <button
                  type="button"
                  onClick={clearAllInList}
                  className="text-gray-500 hover:underline dark:text-gray-400"
                >
                  Снять выбор в списке
                </button>
              </div>
              <div className="py-1">
                {members.map((member) => (
                  <label
                    key={member.id}
                    className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover-surface dark:hover:bg-gray-600 ${
                      value.includes(member.id) ? "bg-blue-50 dark:bg-blue-900/20" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={value.includes(member.id)}
                      onChange={() => toggle(member.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {getMemberFullName(member)}
                      </div>
                      {member.jobTitle && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {member.jobTitle}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
              {hasMore && (
                <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                  Показано {members.length} из {total}. Уточните поиск для остальных.
                </div>
              )}
            </>
          )}
        </div>
      )}
      {value.length > 0 && (
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
          Выбрано: {value.length} участников
        </p>
      )}
    </div>
  );
}
