"use client";

import { useRef, useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onInsertImage?: () => void;
  onInsertVideo?: () => void;
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "Введите текст...",
  onInsertImage,
  onInsertVideo,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdating = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isUpdating.current) {
      if (editorRef.current.innerHTML !== value) {
        let html = value || "";
        // Обертываем все изображения, которые еще не обернуты
        html = html.replace(/<img([^>]*)>/gi, (match, attrs) => {
          // Проверяем, не обернуто ли уже изображение
          if (match.includes('image-wrapper')) {
            return match;
          }
          // Извлекаем существующие стили из атрибутов
          const styleMatch = attrs.match(/style=["']([^"']*)["']/);
          const existingStyle = styleMatch ? styleMatch[1] : '';
          const baseStyle = 'max-width: 100%; height: auto; border-radius: 8px; display: block;';
          const finalStyle = existingStyle ? `${existingStyle}; ${baseStyle}` : baseStyle;
          const cleanAttrs = attrs.replace(/style=["'][^"']*["']/, '').trim();
          return `<div class="image-wrapper" style="position: relative; display: inline-block; max-width: 100%; margin: 8px 0;"><img${cleanAttrs ? ' ' + cleanAttrs : ''} style="${finalStyle}" /><button type="button" class="image-delete-btn" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1;" title="Удалить изображение">×</button></div>`;
        });
        editorRef.current.innerHTML = html;
      }
    }
  }, [value]);

  const handleInput = () => {
    if (editorRef.current) {
      isUpdating.current = true;
      onChange(editorRef.current.innerHTML);
      setTimeout(() => {
        isUpdating.current = false;
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // При нажатии Enter создаём параграф
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      
      // Проверяем, находимся ли мы в списке
      const selection = window.getSelection();
      if (selection && selection.anchorNode) {
        let node = selection.anchorNode.parentElement;
        let inList = false;
        
        while (node && node !== editorRef.current) {
          if (node.tagName === "UL" || node.tagName === "OL") {
            inList = true;
            break;
          }
          node = node.parentElement;
        }
        
        // Если не в списке, создаём параграф
        if (!inList) {
          document.execCommand("formatBlock", false, "<p>");
          document.execCommand("insertHTML", false, "<br>");
        } else {
          // В списке используем стандартное поведение
          document.execCommand("insertHTML", false, "<br>");
        }
      }
      
      handleInput();
    }
  };

  const executeCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleInput();
  };

  const insertHTML = (html: string) => {
    document.execCommand("insertHTML", false, html);
    editorRef.current?.focus();
    handleInput();
  };

  // Экспортируем функцию для вставки изображения извне
  useEffect(() => {
    if (editorRef.current) {
      (editorRef.current as any).insertImage = (url: string, alt: string = "Изображение") => {
        insertHTML(`<div class="image-wrapper" style="position: relative; display: inline-block; max-width: 100%; margin: 8px 0;"><img src="${url}" alt="${alt}" style="max-width: 100%; height: auto; border-radius: 8px; display: block;" /><button type="button" class="image-delete-btn" style="position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1;" title="Удалить изображение">×</button></div>`);
      };
      (editorRef.current as any).insertVideo = (embedUrl: string) => {
        insertHTML(`<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 16px 0; border-radius: 8px;"><iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allowfullscreen></iframe></div>`);
      };
    }
  }, []);

  // Обработка кликов для удаления изображений
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      
      // Если клик по кнопке удаления изображения
      if (target.classList.contains('image-delete-btn')) {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = target.closest('.image-wrapper');
        if (wrapper) {
          wrapper.remove();
          handleInput();
        }
        return;
      }

      // Если клик по изображению, показываем кнопку удаления
      if (target.tagName === 'IMG') {
        const wrapper = target.closest('.image-wrapper');
        if (!wrapper) {
          // Обертываем изображение, если оно еще не обернуто
          const newWrapper = document.createElement('div');
          newWrapper.className = 'image-wrapper';
          newWrapper.style.cssText = 'position: relative; display: inline-block; max-width: 100%; margin: 8px 0;';
          
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.className = 'image-delete-btn';
          deleteBtn.style.cssText = 'position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 16px; line-height: 1;';
          deleteBtn.textContent = '×';
          deleteBtn.title = 'Удалить изображение';
          
          target.parentNode?.insertBefore(newWrapper, target);
          newWrapper.appendChild(target);
          newWrapper.appendChild(deleteBtn);
        }
      }
    };

    editor.addEventListener('click', handleClick);
    return () => {
      editor.removeEventListener('click', handleClick);
    };
  }, []);

  const formatButtons = [
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <text x="2" y="18" fontSize="16" fontWeight="bold" fill="currentColor">H1</text>
        </svg>
      ),
      label: "Заголовок 1",
      action: () => executeCommand("formatBlock", "<h1>"),
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <text x="2" y="18" fontSize="16" fontWeight="bold" fill="currentColor">H2</text>
        </svg>
      ),
      label: "Заголовок 2",
      action: () => executeCommand("formatBlock", "<h2>"),
    },
    {
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <text x="2" y="18" fontSize="16" fontWeight="bold" fill="currentColor">H3</text>
        </svg>
      ),
      label: "Заголовок 3",
      action: () => executeCommand("formatBlock", "<h3>"),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 6h12M6 12h12M6 18h12" />
        </svg>
      ),
      label: "Обычный текст",
      action: () => executeCommand("formatBlock", "<p>"),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M15.6 10.79c.97-.67 1.65-1.77 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.09 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42zM10 6.5h3c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5h-3v-3zm3.5 9H10v-3h3.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5z"/>
        </svg>
      ),
      label: "Жирный",
      action: () => executeCommand("bold"),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4z"/>
        </svg>
      ),
      label: "Курсив",
      action: () => executeCommand("italic"),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
      label: "Ссылка",
      action: () => {
        const url = prompt("Введите URL:");
        if (url) {
          executeCommand("createLink", url);
        }
      },
    },
    {
      type: "separator"
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
        </svg>
      ),
      label: "Маркированный список",
      action: () => executeCommand("insertUnorderedList"),
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
        </svg>
      ),
      label: "Нумерованный список",
      action: () => executeCommand("insertOrderedList"),
    },
    {
      type: "separator"
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      label: "Вставить изображение",
      action: () => {
        if (onInsertImage) {
          onInsertImage();
        } else {
          const url = prompt("Введите URL изображения:");
          if (url) {
            insertHTML(`<img src="${url}" alt="Изображение" style="max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0;" />`);
          }
        }
      },
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      label: "Вставить видео",
      action: () => {
        if (onInsertVideo) {
          onInsertVideo();
        } else {
          const url = prompt("Введите URL видео (YouTube, Rutube, VK):");
          if (url) {
            let embedUrl = "";
            if (url.includes("youtube.com/watch") || url.includes("youtu.be/")) {
              const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1] || "";
              embedUrl = `https://www.youtube.com/embed/${videoId}`;
            } else if (url.includes("rutube.ru/video/")) {
              const videoId = url.match(/rutube\.ru\/video\/([^\/\n?#]+)/)?.[1] || "";
              embedUrl = `https://rutube.ru/play/embed/${videoId}`;
            } else if (url.includes("vk.com/video")) {
              const match = url.match(/vk\.com\/video(-?\d+_\d+)/);
              if (match) {
                const videoId = match[1];
                embedUrl = `https://vk.com/video_ext.php?oid=${videoId.split("_")[0]}&id=${videoId.split("_")[1]}`;
              }
            }
            if (embedUrl) {
              insertHTML(`<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; max-width: 100%; margin: 16px 0; border-radius: 8px;"><iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;" frameborder="0" allowfullscreen></iframe></div>`);
            }
          }
        }
      },
    },
    {
      type: "separator"
    },
    {
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      label: "Очистить форматирование",
      action: () => executeCommand("removeFormat"),
    },
  ];

  return (
    <div className="space-y-2">
      {/* Панель инструментов */}
      <div className="flex flex-wrap gap-1 p-2 bg-gray-100 dark:bg-gray-700 rounded-t-lg border border-gray-300 dark:border-gray-600">
        {formatButtons.map((button, index) => {
          if (button.type === "separator") {
            return (
              <div
                key={`sep-${index}`}
                className="w-px h-8 bg-gray-300 dark:bg-gray-600 mx-1"
              />
            );
          }
          
          return (
            <button
              key={index}
              type="button"
              onClick={button.action}
              title={button.label}
              className="p-2 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition"
            >
              {button.icon}
            </button>
          );
        })}
      </div>

      {/* WYSIWYG редактор */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        className="news-content min-h-[300px] max-h-[500px] overflow-y-auto p-4 bg-white dark:bg-gray-800 border-x border-b border-gray-300 dark:border-gray-600 rounded-b-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
        style={{
          minHeight: "300px",
          maxHeight: "500px",
        }}
        data-placeholder={placeholder}
      />

      <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg">
        <svg
          className="w-4 h-4 mt-0.5 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <strong>Совет:</strong> Выделите текст и нажмите кнопку для форматирования. 
          Нажмите <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">Enter</kbd> для создания нового параграфа или нового элемента списка.
        </div>
      </div>

      <style jsx>{`
        [contentEditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        
        [contentEditable]:focus:before {
          content: none;
        }
        
        kbd {
          font-family: monospace;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
}
