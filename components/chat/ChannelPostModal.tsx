"use client";

import { useState, useEffect } from 'react';
import { X, Image as ImageIcon, Plus, X as XIcon } from 'lucide-react';
import { safeJsonParse } from "@/lib/api-client";
import RichTextEditor from "@/components/admin/RichTextEditor";

interface PollOption {
  id: string;
  text: string;
}

interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  isClosed: boolean;
  closesAt: string | null;
}

interface ChannelPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    content: string;
    coverImage: string | null;
    polls: Poll[];
    isPublished: boolean;
  }) => Promise<void>;
  chatId: string;
}

export default function ChannelPostModal({
  isOpen,
  onClose,
  onSubmit,
  chatId,
}: ChannelPostModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [isPublished, setIsPublished] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      // Сброс формы при закрытии
      setTitle('');
      setContent('');
      setCoverImage(null);
      setPolls([]);
      setIsPublished(true);
    }
  }, [isOpen]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/ppo-head/news/upload-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await safeJsonParse(response) || { error: 'Ошибка загрузки' };
        throw new Error(error.error || 'Ошибка загрузки изображения');
      }

      if (response.ok) {
        const data = await safeJsonParse(response);
        setCoverImage(data?.url || '');
      } else {
        alert('Ошибка загрузки изображения');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      alert('Ошибка загрузки изображения');
    } finally {
      setUploadingImage(false);
    }
  };

  const addPoll = () => {
    setPolls([
      ...polls,
      {
        id: String(Date.now()),
        question: '',
        options: [
          { id: String(Date.now() + 1), text: '' },
          { id: String(Date.now() + 2), text: '' },
        ],
        isClosed: false,
        closesAt: null,
      },
    ]);
  };

  const removePoll = (pollId: string) => {
    setPolls(polls.filter(p => p.id !== pollId));
  };

  const updatePoll = (pollId: string, updates: Partial<Poll>) => {
    setPolls(polls.map(p => p.id === pollId ? { ...p, ...updates } : p));
  };

  const addPollOption = (pollId: string) => {
    setPolls(
      polls.map(p =>
        p.id === pollId
          ? {
              ...p,
              options: [...p.options, { id: String(Date.now()), text: '' }],
            }
          : p
      )
    );
  };

  const removePollOption = (pollId: string, optionId: string) => {
    setPolls(
      polls.map(p =>
        p.id === pollId
          ? {
              ...p,
              options: p.options.filter(opt => opt.id !== optionId),
            }
          : p
      )
    );
  };

  const updatePollOption = (pollId: string, optionId: string, text: string) => {
    setPolls(
      polls.map(p =>
        p.id === pollId
          ? {
              ...p,
              options: p.options.map(opt =>
                opt.id === optionId ? { ...opt, text } : opt
              ),
            }
          : p
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('Заполните заголовок и содержание');
      return;
    }

    // Валидация опросов
    for (const poll of polls) {
      if (!poll.question.trim()) {
        alert('Заполните вопрос опроса');
        return;
      }
      if (poll.options.length < 2) {
        alert('В опросе должно быть минимум 2 варианта ответа');
        return;
      }
      for (const option of poll.options) {
        if (!option.text.trim()) {
          alert('Заполните все варианты ответов');
          return;
        }
      }
    }

    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        content: content.trim(),
        coverImage,
        polls: polls.map(p => ({
          id: p.id,
          question: p.question.trim(),
          options: p.options.map(opt => ({
            id: opt.id,
            text: opt.text.trim(),
          })),
          isClosed: p.isClosed,
          closesAt: p.closesAt,
        })),
        isPublished,
      });
      onClose();
    } catch (error) {
      console.error('Error creating post:', error);
      alert('Ошибка создания поста');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Создать пост в канале
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Заголовок *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Введите заголовок поста"
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
              required
            />
          </div>

          {/* Cover Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Изображение обложки
            </label>
            {coverImage ? (
              <div className="relative">
                <img
                  src={coverImage}
                  alt="Cover"
                  className="w-full max-h-64 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setCoverImage(null)}
                  className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-500 transition-colors">
                <div className="text-center">
                  <ImageIcon className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {uploadingImage ? 'Загрузка...' : 'Нажмите для загрузки изображения'}
                  </span>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                />
              </label>
            )}
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Содержание *
            </label>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Введите содержание поста..."
            />
          </div>

          {/* Polls */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Опросы
              </label>
              <button
                type="button"
                onClick={addPoll}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                <Plus className="w-4 h-4" />
                Добавить опрос
              </button>
            </div>

            {polls.map((poll) => (
              <div
                key={poll.id}
                className="mb-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center justify-between mb-3">
                  <input
                    type="text"
                    value={poll.question}
                    onChange={(e) => updatePoll(poll.id, { question: e.target.value })}
                    placeholder="Вопрос опроса"
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removePoll(poll.id)}
                    className="ml-2 p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2 mb-2">
                  {poll.options.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={option.text}
                        onChange={(e) =>
                          updatePollOption(poll.id, option.id, e.target.value)
                        }
                        placeholder="Вариант ответа"
                        className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white text-sm"
                      />
                      {poll.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => removePollOption(poll.id, option.id)}
                          className="p-2 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addPollOption(poll.id)}
                  className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  + Добавить вариант
                </button>
              </div>
            ))}
          </div>

          {/* Publish immediately */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPublished"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label
              htmlFor="isPublished"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              Опубликовать сразу
            </label>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={loading || !title.trim() || !content.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Создание...' : 'Создать пост'}
          </button>
        </div>
      </div>
    </div>
  );
}
