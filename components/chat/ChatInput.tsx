'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  X,
  Edit2,
  Paperclip,
  Image as ImageIcon,
  FileText,
  Link2,
  Smile,
  AtSign,
  Mic,
  StopCircle,
  Plus,
} from 'lucide-react';
import EmojiPicker from './EmojiPicker';
import MentionAutocomplete, { Participant } from './MentionAutocomplete';
import { compressImages } from '@/lib/compress-image';
import styles from './ChatInput.module.css';

/** Проверяет, нужно ли конвертировать файл из HEIC/HEIF в JPEG (браузер не показывает HEIC в <img>) */
function isHeicFile(file: File): boolean {
  const t = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  return t === 'image/heic' || t === 'image/heif' || name.endsWith('.heic') || name.endsWith('.heif');
}

/** Конвертирует HEIC/HEIF в JPEG в браузере (для превью и отправки). Остальные файлы возвращает как есть. */
async function convertHeicFilesIfNeeded(files: File[]): Promise<File[]> {
  const heic2any = (await import('heic2any')).default;
  const out: File[] = [];
  for (const file of files) {
    if (!isHeicFile(file)) {
      out.push(file);
      continue;
    }
    try {
      const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
      const blobs = Array.isArray(result) ? result : [result];
      const baseName = (file.name || 'image').replace(/\.(heic|heif)$/i, '').replace(/\.$/, '') || 'image';
      blobs.forEach((blob, i) => {
        const name = blobs.length > 1 ? `${baseName}-${i + 1}.jpg` : `${baseName}.jpg`;
        out.push(new File([blob as Blob], name, { type: 'image/jpeg' }));
      });
    } catch (err) {
      console.warn('[ChatInput] HEIC conversion failed, attaching original:', err);
      out.push(file);
    }
  }
  return out;
}

interface ChatInputProps {
  onSend: (content: string, files?: File[], replyToId?: string, threadRootId?: string, mentionedUserIds?: string[]) => void;
  disabled?: boolean;
  replyTo?: {
    id: string;
    content: string;
    senderName?: string;
  } | null;
  threadRootId?: string | null; // ID корневого сообщения треда (если отправляем в тред)
  editingMessage?: string | null;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  placeholder?: string;
  participants?: Participant[]; // Участники чата для упоминаний
  currentUserId?: string; // ID текущего пользователя
}

// Поддерживаемые форматы изображений
const IMAGE_FORMATS = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'image/bmp',
  'image/tiff',
];

// Поддерживаемые форматы документов
const DOCUMENT_FORMATS = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
];

export default function ChatInput({ 
  onSend, 
  disabled, 
  replyTo, 
  threadRootId,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  placeholder = "Напишите сообщение...",
  participants = [],
  currentUserId = '',
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [convertingHeic, setConvertingHeic] = useState(false);
  const [compressingImages, setCompressingImages] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMobileAttach, setShowMobileAttach] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Состояние для упоминаний
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionPosition, setMentionPosition] = useState<{ top: number; left: number } | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const mobileAttachRef = useRef<HTMLDivElement>(null);

  // Close mobile attach menu on outside click
  useEffect(() => {
    if (!showMobileAttach) return;
    const handler = (e: MouseEvent) => {
      if (mobileAttachRef.current && !mobileAttachRef.current.contains(e.target as Node)) {
        setShowMobileAttach(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMobileAttach]);

  // При включении режима редактирования - заполняем поле
  useEffect(() => {
    if (editingMessage) {
      setContent(editingMessage);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Автоматическое изменение высоты textarea (не меньше 40px — одна строка с отступами)
  const TEXTAREA_MIN_HEIGHT = 40;
  const TEXTAREA_MAX_HEIGHT = 200;
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, TEXTAREA_MIN_HEIGHT), TEXTAREA_MAX_HEIGHT);
      textarea.style.height = `${newHeight}px`;
    }
  }, [content]);

  // Парсим упоминания из контента
  const parseMentions = useCallback((text: string): string[] => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentionedIds: string[] = [];
    let match;
    
    while ((match = mentionRegex.exec(text)) !== null) {
      const userId = match[2];
      if (userId && !mentionedIds.includes(userId)) {
        mentionedIds.push(userId);
      }
    }
    
    return mentionedIds;
  }, []);

  const handleSend = useCallback(() => {
    const trimmedContent = content.trim();
    if ((!trimmedContent && attachedFiles.length === 0) || disabled) return;
    
    // Парсим упоминания из контента
    const mentionedUserIds = parseMentions(trimmedContent);
    
    onSend(
      trimmedContent, 
      attachedFiles.length > 0 ? attachedFiles : undefined, 
      replyTo?.id, 
      threadRootId || undefined,
      mentionedUserIds.length > 0 ? mentionedUserIds : undefined
    );
    setContent('');
    setAttachedFiles([]);
    setMentionQuery('');
    setMentionPosition(null);
    setMentionStartIndex(null);
    
    // Сброс высоты textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [content, attachedFiles, disabled, onSend, replyTo?.id, threadRootId, parseMentions]);

  const handleCancel = useCallback(() => {
    if (editingMessage && onCancelEdit) {
      onCancelEdit();
      setContent('');
    } else if (replyTo && onCancelReply) {
      onCancelReply();
    }
  }, [editingMessage, onCancelEdit, replyTo, onCancelReply]);

  // Обработка ввода текста для упоминаний
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    setContent(newContent);
    
    // Проверяем, есть ли упоминание в позиции курсора
    const textBeforeCursor = newContent.substring(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtIndex !== -1) {
      // Проверяем, что после @ нет пробела или переноса строки
      const textAfterAt = textBeforeCursor.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n') && !textAfterAt.includes('[')) {
        // Показываем автодополнение
        const query = textAfterAt.toLowerCase();
        setMentionQuery(query);
        setMentionStartIndex(lastAtIndex);
        
        // Вычисляем позицию для автодополнения
        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const rect = textarea.getBoundingClientRect();
          const scrollTop = textarea.scrollTop;
          
          // Создаем временный элемент для измерения позиции
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.visibility = 'hidden';
          tempDiv.style.whiteSpace = 'pre-wrap';
          tempDiv.style.font = window.getComputedStyle(textarea).font;
          tempDiv.style.padding = window.getComputedStyle(textarea).padding;
          tempDiv.style.width = textarea.offsetWidth + 'px';
          tempDiv.textContent = textBeforeCursor;
          document.body.appendChild(tempDiv);
          
          const textBeforeAt = textBeforeCursor.substring(0, lastAtIndex);
          const lines = textBeforeAt.split('\n');
          const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20;
          
          setMentionPosition({
            top: rect.top + (lines.length - 1) * lineHeight + lineHeight + scrollTop - 10,
            left: rect.left + 10,
          });
          
          document.body.removeChild(tempDiv);
        }
      } else {
        // Скрываем автодополнение
        setMentionQuery('');
        setMentionPosition(null);
        setMentionStartIndex(null);
      }
    } else {
      // Скрываем автодополнение
      setMentionQuery('');
      setMentionPosition(null);
      setMentionStartIndex(null);
    }
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Shift+Enter — новая строка, не перехватываем
    if (e.key === 'Enter' && e.shiftKey) return;
    // Если открыто автодополнение, не обрабатываем Enter здесь
    if (mentionPosition && (e.key === 'Enter' || e.key === 'Tab' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      // Эти клавиши обрабатываются в MentionAutocomplete
      return;
    }
    
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') {
      if (mentionPosition) {
        setMentionQuery('');
        setMentionPosition(null);
        setMentionStartIndex(null);
      } else {
        handleCancel();
      }
    }
  }, [handleSend, handleCancel, mentionPosition]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const hasHeic = files.some(isHeicFile);
    if (hasHeic) setConvertingHeic(true);
    setCompressingImages(true);
    try {
      const converted = hasHeic ? await convertHeicFilesIfNeeded(files) : files;
      const compressed = await compressImages(converted);
      setAttachedFiles(prev => [...prev, ...compressed]);
    } finally {
      setCompressingImages(false);
      if (hasHeic) setConvertingHeic(false);
    }
  }, []);

  const removeFile = useCallback((index: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + emoji + content.slice(end);
      setContent(newContent);
      
      // Устанавливаем курсор после emoji
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + emoji.length, start + emoji.length);
      }, 0);
    } else {
      setContent(prev => prev + emoji);
    }
    setShowEmojiPicker(false);
  }, [content]);

  // Обработка выбора участника из автодополнения
  const handleMentionSelect = useCallback((participant: Participant) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStartIndex === null) return;
    
    const name = [participant.firstName, participant.lastName].filter(Boolean).join(' ') || 'Пользователь';
    const mentionText = `@[${name}](${participant.id}) `;
    
    const textBefore = content.substring(0, mentionStartIndex);
    const textAfter = content.substring(textarea.selectionStart);
    const newContent = textBefore + mentionText + textAfter;
    
    setContent(newContent);
    setMentionQuery('');
    setMentionPosition(null);
    setMentionStartIndex(null);
    
    // Устанавливаем курсор после упоминания
    setTimeout(() => {
      textarea.focus();
      const newCursorPos = mentionStartIndex + mentionText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }, [content, mentionStartIndex]);

  // Drag and drop
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const hasHeic = files.some(isHeicFile);
    if (hasHeic) setConvertingHeic(true);
    setCompressingImages(true);
    try {
      const converted = hasHeic ? await convertHeicFilesIfNeeded(files) : files;
      const compressed = await compressImages(converted);
      setAttachedFiles(prev => [...prev, ...compressed]);
    } finally {
      setCompressingImages(false);
      if (hasHeic) setConvertingHeic(false);
    }
  }, []);

  const isEditing = !!editingMessage;
  const canSend = content.trim() || attachedFiles.length > 0;

  return (
    <div 
      className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-500/10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center z-50">
          <div className="text-blue-600 dark:text-blue-400 font-medium">
            Перетащите файлы сюда
          </div>
        </div>
      )}

      {/* Edit mode banner */}
      {isEditing && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              Редактирование сообщения
            </span>
          </div>
          {onCancelEdit && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="p-1 hover:bg-amber-100 dark:hover:bg-amber-800/30 rounded transition-colors"
              title="Отменить редактирование"
              aria-label="Отменить редактирование"
            >
              <X className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </button>
          )}
        </div>
      )}

      {/* Reply preview */}
      {replyTo && !isEditing && (
        <div className="flex items-center justify-between px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-1 h-8 bg-blue-500 rounded-full flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                {replyTo.senderName || 'Ответ на сообщение'}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                {replyTo.content}
              </div>
            </div>
          </div>
          {onCancelReply && (
            <button
              type="button"
              onClick={onCancelReply}
              className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded transition-colors flex-shrink-0 ml-2"
              title="Отменить ответ"
              aria-label="Отменить ответ"
            >
              <X className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </button>
          )}
        </div>
      )}

      {/* Converting HEIC indicator */}
      {convertingHeic && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm">
          Конвертирую HEIC в JPEG…
        </div>
      )}

      {/* Compressing images indicator */}
      {compressingImages && !convertingHeic && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
          Сжимаем фото перед отправкой…
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap gap-2">
            {attachedFiles.map((file, index) => {
              const isImage = file.type.startsWith('image/');
              const canPreview = isImage && !file.type.includes('heic') && !file.type.includes('heif');
              return (
                <div 
                  key={index}
                  className="relative group"
                >
                  {canPreview ? (
                    <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt={file.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <FileText className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700 dark:text-gray-300 max-w-[150px] truncate">
                        {file.name}
                      </span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Удалить вложение"
                    aria-label={`Удалить вложение ${file.name}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main input area */}
      <div className="p-3">
        <div className={`
          flex items-end gap-2 rounded-2xl border-2 transition-colors px-3 py-2
          ${isEditing 
            ? 'border-amber-300 dark:border-amber-600 bg-amber-50/50 dark:bg-amber-900/10' 
            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
          }
          focus-within:border-blue-400 dark:focus-within:border-blue-500
        `}>
          {/* Hidden file inputs (shared by mobile & desktop) */}
          <input
            ref={imageInputRef}
            type="file"
            accept={IMAGE_FORMATS.join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
            title="Выбрать изображение"
            aria-label="Прикрепить изображение"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={[...IMAGE_FORMATS, ...DOCUMENT_FORMATS].join(',')}
            multiple
            onChange={handleFileSelect}
            className="hidden"
            title="Выбрать файл"
            aria-label="Прикрепить документ"
          />

          {/* Mobile: single "+" button with popover */}
          <div className="flex md:hidden flex-shrink-0 mb-1 relative" ref={mobileAttachRef}>
            <button
              type="button"
              onClick={() => setShowMobileAttach(prev => !prev)}
              className={`p-2 rounded-lg transition-colors ${showMobileAttach ? 'text-blue-500 bg-blue-100/50 dark:bg-blue-900/30' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50'}`}
              title="Прикрепить"
              aria-label="Прикрепить файл или эмодзи"
            >
              <Plus className={`w-5 h-5 transition-transform ${showMobileAttach ? 'rotate-45' : ''}`} />
            </button>
            {showMobileAttach && (
              <div className="absolute bottom-full left-0 mb-2 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]">
                <button
                  type="button"
                  onClick={() => { imageInputRef.current?.click(); setShowMobileAttach(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <ImageIcon className="w-5 h-5 text-blue-500" />
                  <span>Фото</span>
                </button>
                <button
                  type="button"
                  onClick={() => { fileInputRef.current?.click(); setShowMobileAttach(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <Paperclip className="w-5 h-5 text-green-500" />
                  <span>Документ</span>
                </button>
              </div>
            )}
          </div>

          {/* Desktop: three separate buttons */}
          <div className="hidden md:flex items-center gap-1 flex-shrink-0 mb-1">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
              title="Прикрепить изображение"
              aria-label="Прикрепить изображение"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
              title="Прикрепить документ"
              aria-label="Прикрепить документ"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
                title="Добавить эмодзи"
                aria-label="Добавить эмодзи"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-full left-0 mb-2 z-50">
                  <EmojiPicker
                    onEmojiSelect={handleEmojiSelect}
                    showButton={false}
                    isOpen={true}
                    onOpenChange={setShowEmojiPicker}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Text input — min-height под одну строку, чтобы текст/плейсхолдер не обрезались на мобильных */}
          <div className="flex-1 min-w-0 relative flex items-center">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              onKeyDown={handleKeyDown}
              placeholder={isEditing ? "Редактировать сообщение..." : placeholder}
              disabled={disabled}
              rows={1}
              className={`w-full resize-none bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 text-[15px] leading-normal py-2 box-border align-middle ${styles.chatTextarea}`}
              title="Поле ввода сообщения"
              aria-label={isEditing ? "Редактировать сообщение" : "Напишите сообщение"}
            />
            
            {/* Mention Autocomplete */}
            {participants.length > 0 && currentUserId && (
              <MentionAutocomplete
                participants={participants}
                currentUserId={currentUserId}
                query={mentionQuery}
                position={mentionPosition}
                onSelect={handleMentionSelect}
                onClose={() => {
                  setMentionQuery('');
                  setMentionPosition(null);
                  setMentionStartIndex(null);
                }}
              />
            )}
          </div>

          {/* Send button */}
          <div className="flex-shrink-0 mb-1">
            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend || disabled}
              title={isEditing ? "Сохранить правки" : "Отправить сообщение"}
              aria-label={isEditing ? "Сохранить правки" : "Отправить сообщение"}
              className={`
                w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200
                ${canSend && !disabled
                  ? isEditing
                    ? 'bg-amber-500 hover:bg-amber-600 text-white'
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {isEditing ? (
                <Edit2 className="w-5 h-5" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Keyboard hints (hidden on mobile) */}
        <div className="mt-2 px-2 hidden md:flex items-center gap-4 flex-wrap text-[11px]">
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
              Enter
            </kbd>
            <span className="text-gray-500 dark:text-gray-400">отправить</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
              Shift
            </kbd>
            <span className="text-gray-400 dark:text-gray-500">+</span>
            <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
              Enter
            </kbd>
            <span className="text-gray-500 dark:text-gray-400">новая строка</span>
          </div>
          {(isEditing || replyTo) && (
            <div className="flex items-center gap-1.5">
              <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
                Esc
              </kbd>
              <span className="text-gray-500 dark:text-gray-400">отмена</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
