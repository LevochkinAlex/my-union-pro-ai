"use client";

import { memo, useRef, useState, useCallback, useEffect, ChangeEvent, KeyboardEvent } from "react";
import { Message } from "@/types/chat";
import { getUserName, getFileUrl } from "@/lib/chat-utils";

interface ChatInputProps {
  replyingTo: Message | null;
  editingMessage: Message | null;
  disabled?: boolean;
  onSend: (content: string, file?: File) => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
}

function ChatInputComponent({
  replyingTo,
  editingMessage,
  disabled,
  onSend,
  onCancelReply,
  onCancelEdit,
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Инициализация текста при редактировании
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Очистка превью файла при размонтировании
  useEffect(() => {
    return () => {
      if (filePreview) {
        URL.revokeObjectURL(filePreview);
      }
    };
  }, []);

  // Автовысота textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
    }
  }, [text]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Очищаем старый превью
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }

    setFile(selectedFile);

    // Создаём превью для изображений
    if (selectedFile.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(selectedFile));
    } else {
      setFilePreview(null);
    }
  }, [filePreview]);

  const clearFile = useCallback(() => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setFile(null);
    setFilePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [filePreview]);

  const handleSubmit = useCallback(() => {
    const trimmedText = text.trim();
    if (!trimmedText && !file) return;

    onSend(trimmedText, file || undefined);
    setText("");
    clearFile();
  }, [text, file, onSend, clearFile]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter без Shift отправляет сообщение
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleCancel = useCallback(() => {
    if (editingMessage) {
      onCancelEdit();
      setText("");
    } else if (replyingTo) {
      onCancelReply();
    }
  }, [editingMessage, replyingTo, onCancelEdit, onCancelReply]);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Превью ответа/редактирования */}
      {(replyingTo || editingMessage) && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <div className={`w-1 h-10 rounded-full ${editingMessage ? "bg-yellow-500" : "bg-blue-500"}`} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                {editingMessage ? "Редактирование" : `Ответ для ${getUserName(replyingTo?.sender)}`}
              </p>
              <p className="text-sm text-gray-900 dark:text-white truncate">
                {(editingMessage || replyingTo)?.content || "[Вложение]"}
              </p>
            </div>
            <button
              onClick={handleCancel}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Превью файла */}
      {file && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="w-12 h-12 rounded object-cover" />
            ) : (
              <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(file.size / 1024).toFixed(1)} КБ
              </p>
            </div>
            <button
              onClick={clearFile}
              className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Поле ввода */}
      <div className="p-3 md:p-4 flex items-end gap-2">
        {/* Кнопка прикрепления файла */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
          </svg>
        </button>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
        />

        {/* Текстовое поле */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение..."
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm md:text-base disabled:opacity-50"
            style={{ minHeight: "44px", maxHeight: "150px" }}
          />
        </div>

        {/* Кнопка отправки */}
        <button
          onClick={handleSubmit}
          disabled={disabled || (!text.trim() && !file)}
          className="p-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export const ChatInput = memo(ChatInputComponent);
export default ChatInput;

