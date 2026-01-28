"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText, Calendar, User } from "lucide-react";

interface AppealMessageCardProps {
  content: string;
  isOwn?: boolean;
}

/**
 * Компонент для красивого отображения начального сообщения обращения
 */
export default function AppealMessageCard({ content, isOwn = false }: AppealMessageCardProps) {
  // Парсим структуру сообщения обращения
  const appealMatch = content.match(/\*\*Обращение\s*#(\d+)\*\*/);
  const topicMatch = content.match(/\*\*Тема:\*\*\s*(.+?)(?:\n|$)/);
  const textMatch = content.match(/\*\*Текст обращения:\*\*\s*([\s\S]+?)(?:\n\n|\*\*|$)/);
  const dateMatch = content.match(/\*\*Дата и время создания:\*\*\s*(.+?)(?:\n|$)/);

  const appealId = appealMatch?.[1];
  const topic = topicMatch?.[1]?.trim();
  const text = textMatch?.[1]?.trim();
  const date = dateMatch?.[1]?.trim();

  // Если структура не найдена, отображаем как обычное сообщение
  if (!appealId || !topic || !text) {
    return null;
  }

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

        {/* Текст обращения */}
        {text && (
          <div>
            <div className={`
              text-xs font-medium uppercase tracking-wide mb-1.5
              ${isOwn ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 dark:text-gray-400'}
            `}>
              Текст обращения
            </div>
            <div className={`
              prose prose-sm max-w-none
              ${isOwn 
                ? 'prose-invert [&_*]:!text-blue-900 dark:[&_*]:!text-blue-100 [&_p]:!text-blue-900 dark:[&_p]:!text-blue-100' 
                : '[&_p]:text-gray-900 dark:[&_p]:text-gray-100'
              }
            `}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {text}
              </ReactMarkdown>
            </div>
          </div>
        )}

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
