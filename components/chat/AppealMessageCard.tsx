"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Calendar, User, ChevronDown, ChevronUp } from "lucide-react";

const MAX_PREVIEW_CHARS = 320;

interface AppealMessageCardProps {
  content: string;
  isOwn?: boolean;
}

/**
 * Парсит структуру сообщения обращения без захвата артефактов (**Текст обращения:**, **Дата...**).
 * Тема: до \n\n или **. Текст: до \n\n**Дата или конец.
 */
function parseAppealContent(content: string) {
  const appealMatch = content.match(/\*\*Обращение\s*#([\d\-]+)\*\*/);
  // Тема — до двойного переноса или следующего ** (не захватываем **Текст обращения:**)
  const topicMatch = content.match(/\*\*Тема:\*\*\s*([\s\S]*?)(?=\n\n|\s*\*\*|$)/);
  // Текст — до блока **Дата и время создания:** или конца (не захватываем дату в текст)
  const textMatch = content.match(/\*\*Текст обращения:\*\*\s*([\s\S]*?)(?=\*\*Дата и время создания|$)/);
  const dateMatch = content.match(/\*\*Дата и время создания:\*\*\s*([^\n]+)/);

  return {
    appealId: appealMatch?.[1],
    topic: topicMatch?.[1]?.trim().replace(/\n+/g, " ") ?? "",
    text: textMatch?.[1]?.trim() ?? "",
    date: dateMatch?.[1]?.trim(),
  };
}

/**
 * Компонент для красивого отображения начального сообщения обращения
 */
export default function AppealMessageCard({ content, isOwn = false }: AppealMessageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { appealId, topic, text, date } = parseAppealContent(content);

  // Если структура не найдена, отображаем как обычное сообщение (вернёт null — родитель покажет Markdown)
  if (!appealId || !topic) {
    return null;
  }

  const hasLongText = text.length > MAX_PREVIEW_CHARS;
  const displayText = expanded || !hasLongText ? text : text.slice(0, MAX_PREVIEW_CHARS);
  const showExpandButton = hasLongText;

  return (
    <div className={`
      rounded-xl border-2 overflow-hidden
      ${isOwn 
        ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-950/30' 
        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
      }
    `}>
      {/* Заголовок обращения */}
      <div className={`
        px-4 py-3 border-b
        ${isOwn 
          ? 'bg-blue-100 dark:bg-blue-900/50 border-blue-200 dark:border-blue-800' 
          : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
        }
      `}>
        <div className="flex items-center gap-2">
          <FileText className={`
            w-5 h-5
            ${isOwn ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}
          `} />
          <h3 className={`
            font-semibold text-base
            ${isOwn ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}
          `}>
            Обращение #{appealId}
          </h3>
        </div>
      </div>

      {/* Тело сообщения */}
      <div className="px-4 py-3 space-y-3">
        {/* Тема */}
        {topic && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <User className={`
                w-4 h-4
                ${isOwn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}
              `} />
              <span className={`
                text-xs font-medium uppercase tracking-wide
                ${isOwn ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}
              `}>
                Тема
              </span>
            </div>
            <p className={`
              text-sm font-medium
              ${isOwn ? 'text-blue-900 dark:text-blue-100' : 'text-gray-900 dark:text-gray-100'}
            `}>
              {topic}
            </p>
          </div>
        )}

        {/* Текст обращения — краткий превью, без артефактов и без дублирования темы */}
        {text ? (
          <div>
            <div className={`
              prose prose-sm max-w-none
              ${isOwn 
                ? 'prose-invert [&_*]:!text-blue-900 dark:[&_*]:!text-blue-100 [&_p]:!text-blue-900 dark:[&_p]:!text-blue-100' 
                : '[&_p]:text-gray-900 dark:[&_p]:text-gray-100'
              }
            `}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {`${displayText}${!expanded && hasLongText ? "…" : ""}`}
              </ReactMarkdown>
            </div>
            {showExpandButton && (
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className={`
                  mt-2 flex items-center gap-1 text-xs font-medium
                  ${isOwn ? 'text-blue-700 dark:text-blue-400 hover:underline' : 'text-gray-600 dark:text-gray-400 hover:underline'}
                `}
              >
                {expanded ? (
                  <>Свернуть <ChevronUp className="w-3.5 h-3.5" /></>
                ) : (
                  <>Показать полностью <ChevronDown className="w-3.5 h-3.5" /></>
                )}
              </button>
            )}
          </div>
        ) : null}

        {/* Дата создания */}
        {date && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <Calendar className={`
              w-4 h-4
              ${isOwn ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}
            `} />
            <span className={`
              text-xs
              ${isOwn ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}
            `}>
              {date}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
