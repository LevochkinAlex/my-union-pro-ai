'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { User } from 'lucide-react';
import clsx from 'clsx';

export interface Participant {
  id: string;
  firstName: string | null;
  lastName: string | null;
  middleName?: string | null;
  avatarUrl: string | null;
}

interface MentionAutocompleteProps {
  participants: Participant[];
  currentUserId: string;
  query: string; // Текст после @
  position: { top: number; left: number } | null;
  onSelect: (participant: Participant) => void;
  onClose: () => void;
}

export default function MentionAutocomplete({
  participants,
  currentUserId,
  query,
  position,
  onSelect,
  onClose,
}: MentionAutocompleteProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Фильтруем участников по запросу (исключаем текущего пользователя)
  const filteredParticipants = participants
    .filter(p => p.id !== currentUserId)
    .filter(p => {
      if (!query) return true;
      const searchQuery = query.toLowerCase();
      const fullName = [
        p.firstName,
        p.lastName,
        p.middleName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const firstName = (p.firstName || '').toLowerCase();
      const lastName = (p.lastName || '').toLowerCase();
      
      return (
        fullName.includes(searchQuery) ||
        firstName.includes(searchQuery) ||
        lastName.includes(searchQuery)
      );
    })
    .slice(0, 10); // Максимум 10 результатов

  // Сбрасываем выбранный индекс при изменении списка
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredParticipants.length, query]);

  // Прокручиваем к выбранному элементу
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);

  // Обработка клавиатуры
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filteredParticipants.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < filteredParticipants.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (filteredParticipants[selectedIndex]) {
          onSelect(filteredParticipants[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredParticipants, selectedIndex, onSelect, onClose]);

  if (!position || filteredParticipants.length === 0) {
    return null;
  }

  const getParticipantName = (p: Participant): string => {
    return [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Пользователь';
  };

  return (
    <div
      className="fixed z-50 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
      style={{
        top: position.top,
        left: position.left,
        minWidth: '240px',
        maxWidth: '320px',
      }}
      ref={listRef}
    >
      {filteredParticipants.map((participant, index) => (
        <button
          key={participant.id}
          type="button"
          onClick={() => onSelect(participant)}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2 text-left transition-colors',
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/20'
              : 'hover:bg-gray-50 dark:hover:bg-gray-800'
          )}
        >
          {/* Avatar */}
          <div className="flex-shrink-0">
            {participant.avatarUrl ? (
              <img
                src={participant.avatarUrl}
                alt={getParticipantName(participant)}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </div>
            )}
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {getParticipantName(participant)}
            </div>
            {participant.middleName && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {participant.middleName}
              </div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
