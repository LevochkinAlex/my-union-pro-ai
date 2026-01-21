'use client';

import { useState, useRef } from 'react';
import { useTheme } from 'next-themes';
import {
  Textarea,
  Button,
  Card,
  CardBody,
} from '@heroui/react';
import { Send, X } from 'lucide-react';

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
  const { resolvedTheme } = useTheme();

  const handleSend = () => {
    if (!content.trim() || disabled) return;
    
    onSend(content.trim(), replyTo?.id);
    setContent('');
    
    if (textareaRef.current) {
      textareaRef.current.style.height = '48px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-divider bg-content1 p-4">
      {/* Reply preview */}
      {replyTo && (
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
          placeholder="Напишите сообщение..."
          disabled={disabled}
          minRows={1}
          maxRows={5}
          classNames={{
            input: "text-sm",
            inputWrapper: "border-default-200",
          }}
          variant="bordered"
        />
        
        <Button
          color="primary"
          onPress={handleSend}
          isDisabled={!content.trim() || disabled}
          isIconOnly
          className="min-w-12 h-12"
        >
          <Send className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
