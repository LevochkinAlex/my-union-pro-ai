'use client';

import { useState, useRef, KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (content: string, replyToId?: string) => void;
  disabled?: boolean;
  replyTo?: {
    id: string;
    content: string;
  } | null;
  onCancelReply?: () => void;
}

export default function ChatInput({ onSend, disabled, replyTo, onCancelReply }: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!content.trim() || disabled) return;
    
    onSend(content.trim(), replyTo?.id);
    setContent('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {/* Reply preview */}
      {replyTo && (
        <div className="mb-2 pl-3 pr-2 py-2 bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500 rounded flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Ответ на сообщение
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
              {replyTo.content}
            </div>
          </div>
          {onCancelReply && (
            <button
              onClick={onCancelReply}
              className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            handleInput();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Напишите сообщение..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-4 py-2 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ minHeight: '48px', maxHeight: '200px' }}
        />
        
        <button
          onClick={handleSend}
          disabled={!content.trim() || disabled}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Отправить
        </button>
      </div>
    </div>
  );
}
