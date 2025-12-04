"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import ImageUploadWithCrop from "@/components/admin/ImageUploadWithCrop";
import RichTextEditor from "@/components/admin/RichTextEditor";

interface PollOption {
  id: string;
  text: string;
}

interface Poll {
  id?: string;
  question: string;
  options: PollOption[];
  isClosed: boolean;
  closesAt: string | null;
}

export default function EditNewsPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [isPublished, setIsPublished] = useState(false);
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoadingField, setAiLoadingField] = useState<"title" | "content" | null>(null);

  useEffect(() => {
    if (id) {
      loadNews();
    }
  }, [id]);

  const loadNews = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/news/${id}`);
      if (!response.ok) {
        throw new Error("Не удалось загрузить новость");
      }
      const data = await response.json();
      setTitle(data.title || "");
      setContent(data.content || "");
      setCoverImage(data.coverImage || "");
      setIsPublished(data.isPublished || false);
      setPolls(
        (data.polls || []).map((poll: any) => ({
          ...poll,
          options: poll.options || [],
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setLoading(false);
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
    setPolls(
      polls.map((poll, i) => (i === index ? { ...poll, ...updates } : poll))
    );
  };

  const handleAddPollOption = (pollIndex: number) => {
    setPolls(
      polls.map((poll, i) =>
        i === pollIndex
          ? {
              ...poll,
              options: [
                ...poll.options,
                {
                  id: `opt-${Date.now()}-${poll.options.length + 1}`,
                  text: "",
                },
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

  const handleUpdatePollOption = (
    pollIndex: number,
    optionIndex: number,
    text: string
  ) => {
    setPolls(
      polls.map((poll, i) =>
        i === pollIndex
          ? {
              ...poll,
              options: poll.options.map((opt, oi) =>
                oi === optionIndex ? { ...opt, text } : opt
              ),
            }
          : poll
      )
    );
  };

  const handleAiImproveTitle = async () => {
    if (!title.trim()) return;
    
    setAiLoading(true);
    setAiLoadingField("title");
    try {
      const response = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: title }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.improvedText) {
          const tempDiv = document.createElement("div");
          tempDiv.innerHTML = data.improvedText;
          const plainText = tempDiv.textContent || tempDiv.innerText || data.improvedText;
          setTitle(plainText);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Ошибка при улучшении заголовка с помощью AI");
      }
    } catch (error) {
      console.error("Error improving title with AI:", error);
      alert("Ошибка при улучшении заголовка с помощью AI");
    } finally {
      setAiLoading(false);
      setAiLoadingField(null);
    }
  };

  const handleAiImproveContent = async () => {
    if (!content.trim()) return;
    
    setAiLoading(true);
    setAiLoadingField("content");
    try {
      const response = await fetch("/api/ai/improve-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.improvedText) {
          setContent(data.improvedText);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Ошибка при улучшении содержания с помощью AI");
      }
    } catch (error) {
      console.error("Error improving content with AI:", error);
      alert("Ошибка при улучшении содержания с помощью AI");
    } finally {
      setAiLoading(false);
      setAiLoadingField(null);
    }
  };

  const handleAiRewriteContent = async () => {
    if (!content.trim()) return;
    
    setAiLoading(true);
    setAiLoadingField("content");
    try {
      const response = await fetch("/api/ai/rewrite-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rewritten) {
          setContent(data.rewritten);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Ошибка при переписывании содержания с помощью AI");
      }
    } catch (error) {
      console.error("Error rewriting content with AI:", error);
      alert("Ошибка при переписывании содержания с помощью AI");
    } finally {
      setAiLoading(false);
      setAiLoadingField(null);
    }
  };

  const handleAiContinueContent = async () => {
    if (!content.trim()) return;
    
    setAiLoading(true);
    setAiLoadingField("content");
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = content;
      const plainText = tempDiv.textContent || tempDiv.innerText || content;
      
      const response = await fetch("/api/ai/rewrite-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content: plainText + "\n\n[Продолжи текст, развивая основную мысль и добавляя детали]" 
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.rewritten) {
          setContent(data.rewritten);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(errorData.error || "Ошибка при дописывании содержания с помощью AI");
      }
    } catch (error) {
      console.error("Error continuing content with AI:", error);
      alert("Ошибка при дописывании содержания с помощью AI");
    } finally {
      setAiLoading(false);
      setAiLoadingField(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !content.trim()) {
      setError("Заголовок и содержание обязательны");
      return;
    }

    // Валидация опросов
    for (const poll of polls) {
      if (!poll.question.trim()) {
        setError("Все опросы должны иметь вопрос");
        return;
      }
      if (poll.options.length < 2) {
        setError("Каждый опрос должен иметь минимум 2 варианта ответа");
        return;
      }
      for (const option of poll.options) {
        if (!option.text.trim()) {
          setError("Все варианты ответов должны быть заполнены");
          return;
        }
      }
    }

    try {
      setSaving(true);
      const response = await fetch(`/api/admin/news/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          coverImage: coverImage || null,
          isPublished,
          polls: polls.length > 0 ? polls : [],
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Не удалось обновить новость");
      }

      router.push("/admin/news");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Произошла ошибка");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-600 dark:text-gray-400">Загрузка...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-8">
      {/* Кнопка назад */}
      <Link
        href="/admin/news"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Назад к новостям
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
            Редактировать новость
          </h1>
          <p className="mt-1 sm:mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Измените информацию о новости
          </p>
        </div>
        <Link
          href="/admin/news"
          className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
          Отмена
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="title"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  Заголовок *
                </label>
                {title.trim() && (
                  <button
                    type="button"
                    onClick={handleAiImproveTitle}
                    disabled={aiLoading}
                    className="flex items-center gap-1.5 px-3 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                    </svg>
                    {aiLoading && aiLoadingField === "title" ? "Улучшение..." : "Улучшить с AI"}
                  </button>
                )}
              </div>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                placeholder="Введите заголовок новости"
                required
              />
            </div>

            <ImageUploadWithCrop
              value={coverImage}
              onChange={setCoverImage}
              label="Изображение обложки"
            />

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Содержание *
                </label>
                {content.trim() && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleAiImproveContent}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                      </svg>
                      {aiLoading && aiLoadingField === "content" ? "Улучшение..." : "Улучшить"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAiRewriteContent}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      {aiLoading && aiLoadingField === "content" ? "Переписывание..." : "Переписать"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAiContinueContent}
                      disabled={aiLoading}
                      className="flex items-center gap-1.5 px-3 py-1 text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      {aiLoading && aiLoadingField === "content" ? "Дописывание..." : "Дописать"}
                    </button>
                  </div>
                )}
              </div>
              <RichTextEditor
                value={content}
                onChange={setContent}
                placeholder="Введите содержание новости..."
              />
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Используйте панель инструментов для форматирования текста
              </p>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="isPublished"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 dark:border-gray-600"
              />
              <label
                htmlFor="isPublished"
                className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Опубликовано
              </label>
            </div>
          </div>
        </div>

        {/* Опросы */}
        <div className="rounded-lg border border-gray-200 bg-white p-4 sm:p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Опросы
            </h2>
            <button
              type="button"
              onClick={handleAddPoll}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              Добавить опрос
            </button>
          </div>

          {polls.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Опросы необязательны. Нажмите "Добавить опрос" чтобы создать
              голосование.
            </p>
          ) : (
            <div className="space-y-4">
              {polls.map((poll, pollIndex) => (
                <div
                  key={pollIndex}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={poll.question}
                        onChange={(e) =>
                          handleUpdatePoll(pollIndex, {
                            question: e.target.value,
                          })
                        }
                        placeholder="Вопрос опроса"
                        className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemovePoll(pollIndex)}
                      className="ml-2 text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {poll.options.map((option, optionIndex) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={option.text}
                          onChange={(e) =>
                            handleUpdatePollOption(
                              pollIndex,
                              optionIndex,
                              e.target.value
                            )
                          }
                          placeholder={`Вариант ${optionIndex + 1}`}
                          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
                        />
                        {poll.options.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleRemovePollOption(pollIndex, optionIndex)
                            }
                            className="text-red-600 hover:text-red-700 dark:text-red-400"
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => handleAddPollOption(pollIndex)}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
                    >
                      + Добавить вариант
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
          <Link
            href="/admin/news"
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            Отмена
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Сохранение..." : "Сохранить изменения"}
          </button>
        </div>
      </form>
    </div>
  );
}

