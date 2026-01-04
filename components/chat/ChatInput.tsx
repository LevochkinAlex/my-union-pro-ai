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

// Иконки для типов файлов
const FileTypeIcon = memo(function FileTypeIcon({ 
  mimeType, 
  fileName,
  className = "w-6 h-6"
}: { 
  mimeType?: string;
  fileName: string;
  className?: string;
}) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  
  // PDF
  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return (
      <svg className={`${className} text-red-500`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-2 9.5c0 .28-.22.5-.5.5s-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5s.5.22.5.5v3zm-1.5-2c0 .83.67 1.5 1.5 1.5h.5v1.5c0 .28-.22.5-.5.5h-1c-.28 0-.5-.22-.5-.5v-3c0-.28.22-.5.5-.5h1c.28 0 .5.22.5.5v.5h-.5c-.28 0-.5.22-.5.5zm4.5 2c0 .28-.22.5-.5.5h-.5c-.83 0-1.5-.67-1.5-1.5v-2c0-.83.67-1.5 1.5-1.5h.5c.28 0 .5.22.5.5s-.22.5-.5.5h-.5c-.28 0-.5.22-.5.5v2c0 .28.22.5.5.5h.5c.28 0 .5.22.5.5z"/>
      </svg>
    );
  }
  
  // Word documents
  if (mimeType?.includes('word') || ext === 'doc' || ext === 'docx') {
    return (
      <svg className={`${className} text-blue-600`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM9.5 13l1.5 5 1.5-5h1l1.5 5 1.5-5h1l-2 7h-1l-1.5-5-1.5 5h-1l-2-7h1z"/>
      </svg>
    );
  }
  
  // Excel
  if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ext === 'xls' || ext === 'xlsx') {
    return (
      <svg className={`${className} text-green-600`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM9 13l2 3-2 3h1.5l1.25-2 1.25 2H14.5l-2-3 2-3H13l-1.25 2L10.5 13H9z"/>
      </svg>
    );
  }
  
  // Archive
  if (mimeType?.includes('zip') || mimeType?.includes('rar') || mimeType?.includes('archive') || 
      ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return (
      <svg className={`${className} text-yellow-600`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zm-3 5h2v2h-2v2h2v2h-2v2h2v2h-2v2h2v-2h-2v-2h2v-2h-2v-2h2V9h-2z"/>
      </svg>
    );
  }
  
  // Text files
  if (mimeType?.includes('text') || ext === 'txt') {
    return (
      <svg className={`${className} text-gray-600`} viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM8 12h8v2H8v-2zm0 4h6v2H8v-2z"/>
      </svg>
    );
  }
  
  // Default file icon
  return (
    <svg className={`${className} text-gray-500`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
});

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
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);

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

  // Закрытие меню вложений при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setShowAttachMenu(false);
      }
    };
    
    if (showAttachMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showAttachMenu]);

  // Автовысота textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 150; // Максимальная высота в пикселях
      const newHeight = Math.min(scrollHeight, maxHeight);
      textarea.style.height = newHeight + "px";
      textarea.style.maxHeight = maxHeight + "px";
      textarea.style.overflowY = scrollHeight > maxHeight ? "auto" : "hidden";
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
    setShowAttachMenu(false);

    // Создаём превью для изображений
    if (selectedFile.type.startsWith("image/")) {
      setFilePreview(URL.createObjectURL(selectedFile));
    } else {
      setFilePreview(null);
    }
  }, [filePreview]);

  const handlePhotoClick = useCallback(() => {
    fileInputRef.current?.click();
    setShowAttachMenu(false);
  }, []);

  const handleDocumentClick = useCallback(() => {
    docInputRef.current?.click();
    setShowAttachMenu(false);
  }, []);

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
    <div 
      className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
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
          <div className="flex items-center gap-3 p-3 bg-gray-100 dark:bg-gray-700 rounded-xl">
            {filePreview ? (
              <img src={filePreview} alt="Preview" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 bg-white dark:bg-gray-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                <FileTypeIcon mimeType={file.type} fileName={file.name} className="w-8 h-8" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{file.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {file.size < 1024 * 1024 
                  ? `${(file.size / 1024).toFixed(1)} КБ` 
                  : `${(file.size / (1024 * 1024)).toFixed(1)} МБ`}
              </p>
            </div>
            <button
              onClick={clearFile}
              className="p-2 text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Поле ввода */}
      <div className="p-3 md:p-4 flex items-end gap-2" style={{ width: "100%", height: "fit-content", justifyContent: "flex-end" }}>
        {/* Кнопка прикрепления файла с выпадающим меню */}
        <div className="relative" ref={attachMenuRef} style={{ display: "flex", justifyContent: "flex-end", alignItems: "flex-start", boxSizing: "border-box" }}>
          <button
            onClick={() => setShowAttachMenu(!showAttachMenu)}
            disabled={disabled}
            className={`p-2.5 rounded-full transition-colors disabled:opacity-50 flex flex-col justify-center items-center ${
              showAttachMenu 
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" 
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            style={{ borderRadius: "220px" }}
          >
            <svg className={`w-5 h-5 transition-transform ${showAttachMenu ? "rotate-45" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>

          {/* Выпадающее меню вложений */}
          {showAttachMenu && (
            <div className="absolute bottom-full left-0 mb-2 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100">
              <button
                onClick={handlePhotoClick}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>Фото</span>
              </button>

              <button
                onClick={handleDocumentClick}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>Документ</span>
              </button>

              {/* Будущие опции */}
              <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
              
              <div className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
                Скоро: контакт, геолокация
              </div>
            </div>
          )}
        </div>

        {/* Input для фото */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.heic,.heif"
        />

        {/* Input для документов */}
        <input
          ref={docInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,.csv,.zip,.rar,.7z"
        />

        {/* Текстовое поле */}
        <div className="flex-1 relative" style={{ height: "fit-content", width: "100%", display: "flex", flexDirection: "column", verticalAlign: "bottom", overflow: "hidden", boxSizing: "border-box" }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Введите сообщение... (поддерживается **жирный**, *курсив*, - списки)"
            disabled={disabled}
            rows={1}
            className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm md:text-base disabled:opacity-50"
            style={{ minHeight: "48px", height: "100%", width: "100%", boxSizing: "border-box" }}
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
export { FileTypeIcon };
export default ChatInput;

