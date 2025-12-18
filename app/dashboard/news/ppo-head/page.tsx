"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NewsCard from "@/components/dashboard/news/NewsCard";
import RichTextEditor from "@/components/admin/RichTextEditor";
import ImageUploadWithCrop from "@/components/admin/ImageUploadWithCrop";
import { alertSuccess, alertError } from "@/lib/alert";

interface NewsPost {
  id: string;
  title: string;
  content: string;
  coverImage: string | null;
  publishedAt: string | null;
  viewCount: number;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    avatarUrl: string | null;
  };
  channel: {
    id: string;
    name: string;
    iconUrl: string | null;
  } | null;
  _count: {
    likes: number;
    comments: number;
  };
  isLiked: boolean;
  polls: Array<{
    id: string;
    question: string;
    options: any[];
    totalVotes: number;
    userVote: string | null;
    isClosed: boolean;
  }>;
}

interface NewsChannel {
  id: string;
  name: string;
  description: string | null;
  iconUrl: string | null;
  isMain: boolean;
  _count: {
    newsPosts: number;
  };
}

interface PollOption {
  id: string;
  text: string;
}

interface Poll {
  question: string;
  options: PollOption[];
  isClosed: boolean;
  closesAt: string | null;
}

export default function PPOHeadNewsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [news, setNews] = useState<NewsPost[]>([]);
  const [channels, setChannels] = useState<NewsChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [saving, setSaving] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelDescription, setNewChannelDescription] = useState("");
  const [newChannelIcon, setNewChannelIcon] = useState<string | null>(null);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadNews(), loadChannels()]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadNews = async () => {
    try {
      const response = await fetch("/api/ppo-head/news");
      if (response.ok) {
        const data = await response.json();
        setNews(data.news || []);
      }
    } catch (error) {
      console.error("Ошибка загрузки новостей:", error);
    }
  };

  const loadChannels = async () => {
    try {
      const response = await fetch("/api/ppo-head/news-channels");
      if (response.ok) {
        const data = await response.json();
        setChannels(data.channels || []);
        
        // Автоматически выбираем основной канал
        const mainChannel = data.channels?.find((ch: NewsChannel) => ch.isMain);
        if (mainChannel) {
          setSelectedChannelId(mainChannel.id);
        } else if (data.channels?.length > 0) {
          setSelectedChannelId(data.channels[0].id);
        }
      }
    } catch (error) {
      console.error("Ошибка загрузки каналов:", error);
    }
  };

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) {
      alertError("Укажите название канала");
      return;
    }

    try {
      setCreatingChannel(true);
      const response = await fetch("/api/ppo-head/news-channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newChannelName.trim(),
          description: newChannelDescription.trim() || null,
          iconUrl: newChannelIcon,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Ошибка при создании канала");
      }

      const data = await response.json();
      alertSuccess("Канал успешно создан!");
      setShowChannelModal(false);
      setNewChannelName("");
      setNewChannelDescription("");
      setNewChannelIcon(null);
      await loadChannels();
      
      // Выбираем новый канал
      if (data.channel) {
        setSelectedChannelId(data.channel.id);
      }
    } catch (error) {
      console.error("Ошибка создания канала:", error);
      alertError(error instanceof Error ? error.message : "Не удалось создать канал");
    } finally {
      setCreatingChannel(false);
    }
  };

  const handleAddPoll = () => {
    setPolls([
      ...polls,
      {
        question: "",
        options: [
          { id: `opt-${Date.now()}-1`, text: "" },
          { id: `opt-${Date.now()}-2`, text: "" },
        ],
        isClosed: false,
        closesAt: null,
      },
    ]);
  };

  const handleRemovePoll = (index: number) => {
    setPolls(polls.filter((_, i) => i !== index));
  };

  const handleUpdatePoll = (index: number, updates: Partial<Poll>) => {
    setPolls(polls.map((poll, i) => (i === index ? { ...poll, ...updates } : poll)));
  };

  const handleAddPollOption = (pollIndex: number) => {
    setPolls(
      polls.map((poll, i) =>
        i === pollIndex
          ? {
              ...poll,
              options: [
                ...poll.options,
                { id: `opt-${Date.now()}-${poll.options.length + 1}`, text: "" },
              ],
            }
          : poll
      )
    );
  };

  const handleRemovePollOption = (pollIndex: number, optionIndex: number) => {
    setPolls(
      polls.map((poll, i) =>
        i === pollIndex
          ? {
              ...poll,
              options: poll.options.filter((_, oi) => oi !== optionIndex),
            }
          : poll
      )
    );
  };

  const handleUpdatePollOption = (pollIndex: number, optionIndex: number, text: string) => {
    setPolls(
      polls.map((poll, i) =>
        i === pollIndex
          ? {
              ...poll,
              options: poll.options.map((opt, oi) => (oi === optionIndex ? { ...opt, text } : opt)),
            }
          : poll
      )
    );
  };

  const handleCreateNews = async () => {
    if (!title.trim() || !content.trim()) {
      alertError("Заголовок и содержание обязательны");
      return;
    }

    if (!selectedChannelId) {
      alertError("Выберите канал публикации");
      return;
    }

    // Валидация опросов
    for (const poll of polls) {
      if (!poll.question.trim()) {
        alertError("Все опросы должны иметь вопрос");
        return;
      }
      if (poll.options.length < 2) {
        alertError("Каждый опрос должен иметь минимум 2 варианта ответа");
        return;
      }
      for (const option of poll.options) {
        if (!option.text.trim()) {
          alertError("Все варианты ответов должны быть заполнены");
          return;
        }
      }
    }

    try {
      setSaving(true);
      const response = await fetch("/api/ppo-head/news", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          coverImage: coverImage || null,
          channelId: selectedChannelId,
          isPublished,
          polls: polls.length > 0 ? polls : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось создать новость");
      }

      alertSuccess("Новость успешно создана!");
      setIsCreating(false);
      setTitle("");
      setContent("");
      setCoverImage(null);
      setPolls([]);
      setIsPublished(false);
      await loadNews();
    } catch (error) {
      console.error("Ошибка создания новости:", error);
      alertError(error instanceof Error ? error.message : "Не удалось создать новость");
    } finally {
      setSaving(false);
    }
  };

  const handleLikeToggle = async (newsId: string) => {
    try {
      const response = await fetch(`/api/news/${newsId}/like`, {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        setNews((prev) =>
          prev.map((post) =>
            post.id === newsId
              ? {
                  ...post,
                  isLiked: data.liked,
                  _count: {
                    ...post._count,
                    likes: data.count,
                  },
                }
              : post
          )
        );
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const handlePollVote = async (pollId: string, optionId: string) => {
    try {
      const response = await fetch(`/api/news/polls/${pollId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId }),
      });

      if (response.ok) {
        const data = await response.json();
        setNews((prev) =>
          prev.map((post) => ({
            ...post,
            polls: post.polls.map((poll) => (poll.id === pollId ? data.poll : poll)),
          }))
        );
      }
    } catch (err) {
      console.error("Failed to vote:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Новости
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Управление новостями вашей организации
          </p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          + Создать новость
        </button>
      </div>

      {isCreating && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-4 text-xl font-semibold">Создание новости</h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Канал публикации *
              </label>
              <div className="flex gap-2">
                <select
                  value={selectedChannelId}
                  onChange={(e) => setSelectedChannelId(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                >
                  <option value="">Выберите канал</option>
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name} {channel.isMain && "(Основной)"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowChannelModal(true)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  + Добавить канал
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Заголовок *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                placeholder="Введите заголовок новости"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Изображение обложки
              </label>
              <ImageUploadWithCrop value={coverImage} onChange={setCoverImage} label="" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Содержание *
              </label>
              <div ref={editorRef}>
                <RichTextEditor
                  value={content}
                  onChange={setContent}
                  placeholder="Введите содержание новости..."
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isPublished"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
              />
              <label htmlFor="isPublished" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                Опубликовать сразу
              </label>
            </div>

            {/* Опросы */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Опросы</h3>
                <button
                  type="button"
                  onClick={handleAddPoll}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600"
                >
                  + Добавить опрос
                </button>
              </div>

              {polls.length > 0 && (
                <div className="space-y-4">
                  {polls.map((poll, pollIndex) => (
                    <div
                      key={pollIndex}
                      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <input
                          type="text"
                          value={poll.question}
                          onChange={(e) => handleUpdatePoll(pollIndex, { question: e.target.value })}
                          placeholder="Вопрос опроса"
                          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemovePoll(pollIndex)}
                          className="ml-2 text-red-600 hover:text-red-700"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="space-y-2">
                        {poll.options.map((option, optionIndex) => (
                          <div key={option.id} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={option.text}
                              onChange={(e) => handleUpdatePollOption(pollIndex, optionIndex, e.target.value)}
                              placeholder={`Вариант ${optionIndex + 1}`}
                              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-700"
                            />
                            {poll.options.length > 2 && (
                              <button
                                type="button"
                                onClick={() => handleRemovePollOption(pollIndex, optionIndex)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddPollOption(pollIndex)}
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          + Добавить вариант
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleCreateNews}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Создание..." : "Создать новость"}
              </button>
              <button
                onClick={() => {
                  setIsCreating(false);
                  setTitle("");
                  setContent("");
                  setCoverImage(null);
                  setPolls([]);
                  setIsPublished(false);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Список новостей */}
      <div className="space-y-6">
        {news.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-600 dark:text-gray-400">
              Новостей пока нет. Создайте первую новость.
            </p>
          </div>
        ) : (
          news.map((post) => (
            <NewsCard
              key={post.id}
              post={post}
              onLikeToggle={handleLikeToggle}
              onPollVote={handlePollVote}
            />
          ))
        )}
      </div>

      {/* Модалка создания канала */}
      {showChannelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-700 dark:bg-gray-800 w-full max-w-md">
            <h2 className="text-xl font-semibold mb-4">Создать новый канал</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Название канала *
                </label>
                <input
                  type="text"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  placeholder="Например: Новости профкома"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Описание
                </label>
                <textarea
                  value={newChannelDescription}
                  onChange={(e) => setNewChannelDescription(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-700"
                  rows={3}
                  placeholder="Описание канала..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Иконка канала
                </label>
                <ImageUploadWithCrop
                  value={newChannelIcon}
                  onChange={setNewChannelIcon}
                  label=""
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateChannel}
                  disabled={creatingChannel || !newChannelName.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creatingChannel ? "Создание..." : "Создать"}
                </button>
                <button
                  onClick={() => {
                    setShowChannelModal(false);
                    setNewChannelName("");
                    setNewChannelDescription("");
                    setNewChannelIcon(null);
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

