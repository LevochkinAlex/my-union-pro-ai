"use client";

import { useRef, useEffect, useState } from "react";
import { useAlert } from "@/components/ui/Alert";

interface SimpleRichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/**
 * Упрощенный WYSIWYG редактор без заголовков
 * Поддерживает: жирный текст, курсив, списки, ссылки
 */
export default function SimpleRichTextEditor({
  value,
  onChange,
  placeholder = "Введите текст...",
}: SimpleRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdating = useRef(false);
  const [isImproving, setIsImproving] = useState(false);
  const { showAlert, AlertComponent } = useAlert();

  useEffect(() => {
    if (editorRef.current && !isUpdating.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
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

  const handleImproveText = async () => {
    if (!value || value.trim().length === 0) {
      showAlert({
        message: "Сначала введите текст для улучшения",
        type: "warning",
      });
      return;
    }

    setIsImproving(true);
    try {
      const response = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: value }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при улучшении текста");
      }

      const data = await response.json();
      onChange(data.improvedText);
      showAlert({
        message: "Текст успешно улучшен",
        type: "success",
      });
    } catch (error) {
      console.error("Error improving text:", error);
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при улучшении текста",
        type: "error",
      });
    } finally {
      setIsImproving(false);
    }
  };

  const formatButtons = [
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
      label: "Очистить форматирование",
      action: () => {
        // Если ничего не выделено - выделяем весь текст
        const selection = window.getSelection();
        if (selection && selection.isCollapsed && editorRef.current) {
          const range = document.createRange();
          range.selectNodeContents(editorRef.current);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        executeCommand("removeFormat");
      },
    },
    {
      type: "separator"
    },
    {
      icon: isImproving ? (
        <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      label: isImproving ? "Улучшение..." : "Улучшить текст с AI",
      action: handleImproveText,
      disabled: isImproving,
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
              disabled={button.disabled}
              className={`p-2 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition ${
                button.disabled ? "opacity-50 cursor-not-allowed" : ""
              } ${index === formatButtons.length - 1 ? "bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30" : ""}`}
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
        className="min-h-[200px] max-h-[400px] overflow-y-auto p-4 bg-white dark:bg-gray-800 border-x border-b border-gray-300 dark:border-gray-600 rounded-b-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
        data-placeholder={placeholder}
      />

      <style jsx>{`
        [contentEditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        
        [contentEditable]:focus:before {
          content: none;
        }
      `}</style>
      {AlertComponent}
    </div>
  );
}

