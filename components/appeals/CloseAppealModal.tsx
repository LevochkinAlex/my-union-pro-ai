"use client";

import { useState } from 'react';
import { X } from 'lucide-react';

interface CloseAppealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: (rating: number, comment: string) => Promise<void>; // Для обычного закрытия с рейтингом
  isForceClose?: boolean; // Для председателя - принудительное закрытие
  forceCloseReason?: string; // Причина для принудительного закрытия
  onForceClose?: (reason: string) => Promise<void>; // Для принудительного закрытия
  ticketId: string;
  ticketPublicId: string;
}

export default function CloseAppealModal({
  isOpen,
  onClose,
  onConfirm,
  isForceClose = false,
  forceCloseReason = '',
  onForceClose,
  ticketId,
  ticketPublicId,
}: CloseAppealModalProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState(forceCloseReason);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (isForceClose && onForceClose) {
      if (!reason || !reason.trim()) {
        alert('Укажите причину закрытия обращения');
        return;
      }
      setLoading(true);
      try {
        await onForceClose(reason.trim());
        // Закрываем модальное окно только при успешном выполнении
        handleClose();
      } catch (error) {
        console.error('Error force closing appeal:', error);
        // Ошибка уже обработана в onForceClose (показан toast)
        // Не закрываем модальное окно, чтобы пользователь мог исправить и повторить
      } finally {
        setLoading(false);
      }
    } else if (onConfirm) {
      if (rating < 1 || rating > 5) {
        alert('Выберите оценку от 1 до 5');
        return;
      }
      setLoading(true);
      try {
        await onConfirm(rating, comment.trim());
        // Закрываем модальное окно только при успешном выполнении
        handleClose();
      } catch (error) {
        console.error('Error closing appeal:', error);
        // Ошибка уже обработана в onConfirm (показан toast)
        // Не закрываем модальное окно, чтобы пользователь мог исправить и повторить
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClose = () => {
    setRating(0);
    setComment('');
    setReason('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {isForceClose ? 'Закрыть обращение' : 'Закрыть обращение'}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            disabled={loading}
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isForceClose ? (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Причина закрытия *
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Укажите причину закрытия обращения..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white min-h-[100px]"
                  required
                  disabled={loading}
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Обращение будет закрыто принудительно. Пользователь получит уведомление с указанной причиной.
              </p>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Оцените качество работы по обращению #{ticketPublicId}
                </p>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Оценка *
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      disabled={loading}
                      className={`w-12 h-12 rounded-lg border-2 transition-all ${
                        rating >= star
                          ? 'bg-yellow-400 border-yellow-500 text-yellow-900'
                          : 'bg-gray-100 border-gray-300 text-gray-400 hover:bg-gray-200 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700'
                      }`}
                    >
                      <svg
                        className="w-6 h-6 mx-auto"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                    </button>
                  ))}
                </div>
                {rating > 0 && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    Выбрано: {rating} из 5
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Комментарий (необязательно)
                </label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Опишите ваше мнение о качестве работы..."
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white min-h-[100px]"
                  disabled={loading}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || (isForceClose ? !reason?.trim() : rating < 1)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Закрытие...' : 'Закрыть обращение'}
          </button>
        </div>
      </div>
    </div>
  );
}
