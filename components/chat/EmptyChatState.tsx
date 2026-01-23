"use client";

import { MessageCircle, Bot, Users, Search } from "lucide-react";

interface EmptyChatStateProps {
  isChairman?: boolean;
}

export default function EmptyChatState({ isChairman = false }: EmptyChatStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center p-8 max-w-md">
        {/* Animated icon */}
        <div className="relative w-32 h-32 mx-auto mb-6">
          <div className="absolute inset-0 rounded-full bg-blue-100 dark:bg-blue-900/30 animate-pulse" />
          <div className="absolute inset-4 rounded-full bg-blue-200 dark:bg-blue-800/40 flex items-center justify-center">
            <MessageCircle className="w-12 h-12 text-blue-500 dark:text-blue-400" />
          </div>
          
          {/* Floating icons */}
          <div className="absolute -top-2 -right-2 w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center animate-bounce" style={{ animationDelay: '0.2s' }}>
            <Bot className="w-5 h-5 text-purple-500" />
          </div>
          <div className="absolute -bottom-2 -left-2 w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center animate-bounce" style={{ animationDelay: '0.4s' }}>
            <Users className="w-4 h-4 text-green-500" />
          </div>
        </div>

        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Добро пожаловать в чаты
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
          Выберите чат из списка слева или начните новый разговор с коллегами. 
          ИИ-Ассистент всегда готов помочь!
        </p>

        {/* Quick tips */}
        <div className="grid grid-cols-1 gap-3 text-left">
          <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
              <MessageCircle className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">Личные сообщения</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Общайтесь напрямую с коллегами</div>
            </div>
          </div>
          
          <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
              <Bot className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <div className="text-sm font-medium text-gray-900 dark:text-white">ИИ-Ассистент</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Задавайте вопросы по профсоюзу</div>
            </div>
          </div>
          
          {/* Групповые чаты - только для председателей */}
          {isChairman && (
            <div className="flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                <Users className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-white">Групповые чаты</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Обсуждайте темы в командах</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
