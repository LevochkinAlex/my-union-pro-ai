'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';
import {
  Textarea,
  Button,
  Card,
  CardBody,
} from '@heroui/react';
import { Send, X, Edit2, Paperclip, Smile } from 'lucide-react';

interface ChatInputProps {
  onSend: (content: string, replyToId?: string) => void;
  disabled?: boolean;
  replyTo?: {
    id: string;
    content: string;
  } | null;
  editingMessage?: string | null;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
}

export default function ChatInput({ 
  onSend, 
  disabled, 
  replyTo, 
  editingMessage,
  onCancelReply,
  onCancelEdit 
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { resolvedTheme } = useTheme();

  // При включении режима редактирования - заполняем поле
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  const handleSend = () => {
    if (!content.trim() || disabled) return;
    
    onSend(content.trim(), replyTo?.id);
    setContent('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  const handleCancel = () => {
    if (editingMessage && onCancelEdit) {
      onCancelEdit();
      setContent('');
    } else if (replyTo && onCancelReply) {
      onCancelReply();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const isEditing = !!editingMessage;

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
      {/* Edit mode banner */}
      {isEditing && (
        <div className="mb-2 flex items-center justify-between px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              Редактирование сообщения
            </span>
          </div>
          {onCancelEdit && (
            <button
              onClick={onCancelEdit}
              className="p-1 hover:bg-yellow-100 dark:hover:bg-yellow-800/30 rounded"
            >
              <X className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </button>
          )}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && !isEditing && (
        <Card className="mb-2" shadow="sm">
          <CardBody className="p-2 bg-primary-50 dark:bg-primary-900/20">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-primary mb-1">
                  Ответ на сообщение
                </div>
                <div className="text-xs text-foreground-600 dark:text-foreground-400 truncate">
                  {replyTo.content}
                </div>
              </div>
              {onCancelReply && (
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  onPress={onCancelReply}
                  className="min-w-6 w-6 h-6"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* Input */}
      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isEditing ? "Редактировать сообщение..." : "Напишите сообщение..."}
          disabled={disabled}
          minRows={1}
          maxRows={5}
          classNames={{
            input: "text-sm",
            inputWrapper: `border-default-200 ${isEditing ? 'border-yellow-400 dark:border-yellow-600' : ''}`,
          }}
          variant="bordered"
        />
        
        <Button
          color={isEditing ? "warning" : "primary"}
          onPress={handleSend}
          isDisabled={!content.trim() || disabled}
          isIconOnly
          className="min-w-12 h-12"
        >
          {isEditing ? (
            <Edit2 className="w-5 h-5" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </Button>
      </div>
      
      {/* Keyboard hint */}
      <div className="mt-1 text-xs text-gray-400 dark:text-gray-500">
        <span className="hidden sm:inline">
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs">Enter</kbd> отправить • 
          <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs ml-1">Shift+Enter</kbd> новая строка
          {(isEditing || replyTo) && (
            <> • <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs ml-1">Esc</kbd> отмена</>
          )}
        </span>
      </div>
    </div>
  );
}
