"use client";

import { useState } from "react";

interface AIChatWelcomeProps {
  onQuestionClick: (question: string) => void;
}

export default function AIChatWelcome({ onQuestionClick }: AIChatWelcomeProps) {
  return (
    <div className="flex flex-col h-full items-center justify-center px-4 py-8">
      {/* Приветствие */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 mb-4 shadow-lg overflow-hidden">
          <img
            src="/icon-512x512.png"
            alt="AI Помощник"
            className="w-full h-full object-cover"
          />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Привет! Я ваш AI-помощник
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Чем могу помочь сегодня?
        </p>
      </div>

      {/* Подсказки с примерами вопросов */}
      <div className="w-full max-w-md space-y-3">
        <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide font-medium px-1 mb-2">
          Популярные вопросы:
        </p>

        {/* Карточка: Профсоюз */}
        <button
          onClick={() => onQuestionClick("Для чего нужен профсоюз и какие преимущества даёт членство?")}
          className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-100 dark:border-blue-800/30 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                Зачем нужен профсоюз?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Узнать о преимуществах членства
              </p>
            </div>
            <svg className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Карточка: Обращение */}
        <button
          onClick={() => onQuestionClick("Как создать обращение к председателю профсоюза?")}
          className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 border border-green-100 dark:border-green-800/30 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">
                Как создать обращение?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Связаться с председателем
              </p>
            </div>
            <svg className="w-4 h-4 text-gray-400 group-hover:text-green-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Карточка: Скидки */}
        <button
          onClick={() => onQuestionClick("Как использовать скидки от партнёров профсоюза?")}
          className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border border-orange-100 dark:border-orange-800/30 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                Как получить скидки?
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Скидки до 50% от партнёров
              </p>
            </div>
            <svg className="w-4 h-4 text-gray-400 group-hover:text-orange-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>

        {/* Карточка: Документы */}
        <button
          onClick={() => onQuestionClick("Какие документы я могу получить в профсоюзе?")}
          className="w-full text-left p-3 rounded-xl bg-gradient-to-r from-violet-50 to-pink-50 dark:from-violet-900/20 dark:to-pink-900/20 border border-violet-100 dark:border-violet-800/30 hover:shadow-md transition-all group"
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                Документы профсоюза
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Справки, заявления, членство
              </p>
            </div>
            <svg className="w-4 h-4 text-gray-400 group-hover:text-violet-500 transition-colors flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}
