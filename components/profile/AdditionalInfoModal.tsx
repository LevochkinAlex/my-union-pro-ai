"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { ProgressBarFill } from "@/components/ui/ProgressBarFill";

interface Award {
  type: "ведомственная" | "государственная" | "профсоюзная";
  year: string;
  description: string;
}

interface AdditionalInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export default function AdditionalInfoModal({
  isOpen,
  onClose,
  onComplete,
}: AdditionalInfoModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hobbies, setHobbies] = useState("");
  const [aboutMe, setAboutMe] = useState("");
  const [additionalInfo, setAdditionalInfo] = useState("");
  const [awards, setAwards] = useState<Award[]>([]);

  const [isAddingAward, setIsAddingAward] = useState(false);
  const [editingAwardIndex, setEditingAwardIndex] = useState<number | null>(null);
  const [newAward, setNewAward] = useState<Award>({
    type: "ведомственная",
    year: "",
    description: "",
  });

  const [loadedPayload, setLoadedPayload] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    fetch("/api/profile/additional-info")
      .then((r) => {
        if (!r.ok) throw new Error("Не удалось загрузить данные");
        return r.json();
      })
      .then((data) => {
        setHobbies(data.hobbies ?? "");
        setAboutMe(data.aboutMe ?? "");
        setAdditionalInfo(data.additionalInfo ?? "");
        if (data.awards) {
          try {
            const parsed = JSON.parse(data.awards);
            if (Array.isArray(parsed)) setAwards(parsed);
          } catch {
            setAwards([]);
          }
        } else {
          setAwards([]);
        }
        setLoadedPayload(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [isOpen]);

  const saveAward = () => {
    if (!newAward.type || !newAward.year || !newAward.description.trim()) {
      setError("Заполните все поля награды");
      return;
    }
    const yearNum = parseInt(newAward.year, 10);
    const currentYear = new Date().getFullYear();
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > currentYear) {
      setError(`Год награды должен быть от 1900 до ${currentYear}`);
      return;
    }
    if (editingAwardIndex !== null) {
      const next = [...awards];
      next[editingAwardIndex] = { ...newAward };
      setAwards(next);
      setEditingAwardIndex(null);
    } else {
      setAwards([...awards, { ...newAward }]);
      setIsAddingAward(false);
    }
    setNewAward({ type: "ведомственная", year: "", description: "" });
    setError(null);
  };

  const removeAward = (index: number) => {
    setAwards(awards.filter((_, i) => i !== index));
    if (editingAwardIndex === index) {
      setEditingAwardIndex(null);
      setIsAddingAward(false);
      setNewAward({ type: "ведомственная", year: "", description: "" });
    } else if (editingAwardIndex !== null && editingAwardIndex > index) {
      setEditingAwardIndex(editingAwardIndex - 1);
    }
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const awardsJSON = awards.length > 0 ? JSON.stringify(awards) : "";
      const body = {
        ...loadedPayload,
        hobbies: hobbies.trim() || "",
        aboutMe: aboutMe.trim() || "",
        additionalInfo: additionalInfo.trim() || "",
        awards: awardsJSON,
      };
      const res = await fetch("/api/profile/additional-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Не удалось сохранить");
      }
      onComplete?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-2xl flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[85vh]">
      <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
          Заполните дополнительную информацию и награды
        </h2>

        {loading ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">Загрузка...</div>
        ) : (
          <>
            <div className="mb-4">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Шаг {step} из 2
              </span>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                <ProgressBarFill
                  value={step * 50}
                  className="h-full rounded-full bg-green-600 progress-bar-fill"
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {error}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Дополнительная информация
                </h3>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Хобби и увлечения
                  </label>
                  <textarea
                    value={hobbies}
                    onChange={(e) => setHobbies(e.target.value)}
                    placeholder="Ваши хобби, интересы и увлечения"
                    rows={3}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    О себе
                  </label>
                  <textarea
                    value={aboutMe}
                    onChange={(e) => setAboutMe(e.target.value)}
                    placeholder="Расскажите о себе: характер, привычки, что вас вдохновляет"
                    rows={4}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Дополнительная информация
                  </label>
                  <textarea
                    value={additionalInfo}
                    onChange={(e) => setAdditionalInfo(e.target.value)}
                    placeholder="Любая другая информация, которой хотите поделиться"
                    rows={4}
                    className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Награды
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Укажите ваши награды (ведомственные, государственные, профсоюзные)
                </p>

                {!isAddingAward && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewAward({ type: "ведомственная", year: "", description: "" });
                      setIsAddingAward(true);
                      setEditingAwardIndex(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Добавить награду
                  </button>
                )}

                {isAddingAward && (
                  <div className="rounded-lg border-2 border-blue-300 bg-blue-50 p-4 dark:border-blue-600 dark:bg-blue-900/20">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
                      {editingAwardIndex !== null ? "Редактирование награды" : "Добавление награды"}
                    </h4>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Тип <span className="text-red-500">*</span>
                        </label>
                        <select
                          aria-label="Тип награды"
                          value={newAward.type}
                          onChange={(e) => setNewAward({ ...newAward, type: e.target.value as Award["type"] })}
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        >
                          <option value="ведомственная">Ведомственная</option>
                          <option value="государственная">Государственная</option>
                          <option value="профсоюзная">Профсоюзная</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Год <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newAward.year}
                          onChange={(e) => setNewAward({ ...newAward, year: e.target.value })}
                          placeholder="2020"
                          maxLength={4}
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
                          Описание <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={newAward.description}
                          onChange={(e) => setNewAward({ ...newAward, description: e.target.value })}
                          placeholder="Описание награды"
                          className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingAward(false);
                          setEditingAwardIndex(null);
                          setNewAward({ type: "ведомственная", year: "", description: "" });
                        }}
                        className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={saveAward}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {editingAwardIndex !== null ? "Сохранить" : "Добавить"}
                      </button>
                    </div>
                  </div>
                )}

                {awards.length === 0 && !isAddingAward ? (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center dark:border-gray-700 dark:bg-gray-900">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Нажмите «Добавить награду» или перейдите к сохранению
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {awards.map((award, index) => (
                      <div
                        key={index}
                        className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1">
                          <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-200">
                            {award.type === "ведомственная" ? "Ведомственная" : award.type === "государственная" ? "Государственная" : "Профсоюзная"}
                          </span>
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">{award.year}</span>
                          <p className="mt-1 text-sm text-gray-900 dark:text-white">{award.description}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setNewAward({ ...award });
                              setEditingAwardIndex(index);
                              setIsAddingAward(true);
                            }}
                            className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700"
                            title="Редактировать"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAward(index)}
                            className="rounded-lg bg-red-600 p-2 text-white hover:bg-red-700"
                            title="Удалить"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Назад
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                {step < 2 ? (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    Далее: Награды
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {saving ? "Сохранение..." : "Сохранить"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
