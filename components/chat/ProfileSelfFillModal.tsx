"use client";

import { useState, useCallback, useEffect } from "react";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import Autocomplete from "@/components/form/Autocomplete";

interface ProfileSelfFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

type Step = 1 | 2 | 3;

export function ProfileSelfFillModal({
  isOpen,
  onClose,
  sessionId,
}: ProfileSelfFillModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);

  // Справочники профессий и должностей
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);

  // Данные формы
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    dateOfBirth: "",
    phone: "",
    address: "",
    jobTitle: "",
    profession: "",
    education: "",
    organizationName: "",
  });

  // Загрузка справочников
  useEffect(() => {
    const loadDictionaries = async () => {
      try {
        const response = await fetch("/api/dictionaries");
        if (response.ok) {
          const data = await response.json();
          setJobTitles(data.jobTitles || []);
          setProfessions(data.professions || []);
        }
      } catch (error) {
        console.error("Failed to load dictionaries:", error);
      }
    };

    if (isOpen) {
      loadDictionaries();
    }
  }, [isOpen]);

  const [additionalData, setAdditionalData] = useState({
    employmentStatus: "",
    maritalStatus: "",
    spouseInfo: "",
    hasChildren: false,
    hobbies: "",
    aboutMe: "",
    additionalInfo: "",
  });

  const [uploadedDocs, setUploadedDocs] = useState<{
    membership?: File;
    contribution?: File;
  }>({});

  const handleClose = useCallback(() => {
    if (hasUnsavedChanges && currentStep < 3) {
      setShowCloseWarning(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, currentStep, onClose]);

  const handleConfirmClose = () => {
    setShowCloseWarning(false);
    onClose();
  };

  const handleNextStep = async () => {
    if (currentStep === 1) {
      // Валидация и сохранение основных данных
      const isValid = validateStep1();
      if (!isValid) return;
      
      await saveProfileData();
      setCurrentStep(2);
    } else if (currentStep === 2) {
      // Проверка загрузки документов
      const isValid = validateStep2();
      if (!isValid) return;
      
      await uploadDocuments();
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Сохранение дополнительной информации
      await saveAdditionalData();
      setHasUnsavedChanges(false);
      
      // Закрываем модалку и отправляем сообщение в чат
      await sendCompletionMessage();
      onClose();
    }
  };

  const handleSkipAdditionalInfo = async () => {
    // Пропускаем заполнение дополнительной информации
    setHasUnsavedChanges(false);
    await sendCompletionMessage();
    onClose();
  };

  const validateStep1 = (): boolean => {
    // Проверка обязательных полей шага 1
    if (
      !profileData.firstName ||
      !profileData.lastName ||
      !profileData.dateOfBirth ||
      !profileData.phone ||
      !profileData.address ||
      !profileData.jobTitle ||
      !profileData.profession ||
      !profileData.education
    ) {
      alert("Заполните все обязательные поля");
      return false;
    }
    
    // Проверяем, что должность есть в справочнике
    if (!jobTitles.includes(profileData.jobTitle)) {
      alert(`Должность "${profileData.jobTitle}" не найдена в справочнике. Выберите должность из списка.`);
      return false;
    }
    
    // Проверяем, что профессия есть в справочнике
    if (!professions.includes(profileData.profession)) {
      alert(`Профессия "${profileData.profession}" не найдена в справочнике медицинских профессий. Выберите профессию из списка.`);
      return false;
    }
    
    return true;
  };

  const validateStep2 = (): boolean => {
    if (!uploadedDocs.membership || !uploadedDocs.contribution) {
      alert("Загрузите оба документа");
      return false;
    }
    return true;
  };

  const saveProfileData = async () => {
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) throw new Error("Failed to save profile");
    } catch (error) {
      console.error("Error saving profile:", error);
      alert("Ошибка при сохранении профиля");
      throw error;
    }
  };

  const uploadDocuments = async () => {
    try {
      const formData = new FormData();
      if (uploadedDocs.membership) {
        formData.append("membership", uploadedDocs.membership);
      }
      if (uploadedDocs.contribution) {
        formData.append("contribution", uploadedDocs.contribution);
      }

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Failed to upload documents");
    } catch (error) {
      console.error("Error uploading documents:", error);
      alert("Ошибка при загрузке документов");
      throw error;
    }
  };

  const saveAdditionalData = async () => {
    try {
      const response = await fetch("/api/profile/additional-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(additionalData),
      });

      if (!response.ok) throw new Error("Failed to save additional info");
    } catch (error) {
      console.error("Error saving additional info:", error);
      alert("Ошибка при сохранении дополнительной информации");
      throw error;
    }
  };

  const sendCompletionMessage = async () => {
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "[SELF_FILL_COMPLETED]",
          sessionId,
        }),
      });
    } catch (error) {
      console.error("Error sending completion message:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-50" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl max-h-[90vh] overflow-auto bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Самостоятельное заполнение профиля
              </h2>
              <span className="text-sm font-medium text-blue-600 dark:text-blue-400">
                {Math.round(((currentStep - 1) / 3) * 100 + 33)}% заполнено
              </span>
            </div>
            
            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.round(((currentStep - 1) / 3) * 100 + 33)}%` }}
              />
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Шаг {currentStep} из 3
            </p>
          </div>
          <button
            onClick={handleClose}
            className="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-semibold
                    ${
                      currentStep >= step
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                    }
                  `}
                >
                  {step}
                </div>
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {step === 1 && "Основные данные"}
                    {step === 2 && "Документы"}
                    {step === 3 && "Дополнительно"}
                  </p>
                </div>
                {step < 3 && (
                  <div
                    className={`h-1 flex-1 mx-4 ${
                      currentStep > step
                        ? "bg-blue-600"
                        : "bg-gray-200 dark:bg-gray-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {currentStep === 1 && (
            <Step1ProfileForm
              data={profileData}
              onChange={(data) => {
                setProfileData(data);
                setHasUnsavedChanges(true);
              }}
              jobTitles={jobTitles}
              professions={professions}
            />
          )}

          {currentStep === 2 && (
            <Step2DocumentsUpload
              docs={uploadedDocs}
              onChange={(docs) => {
                setUploadedDocs(docs);
                setHasUnsavedChanges(true);
              }}
            />
          )}

          {currentStep === 3 && (
            <Step3AdditionalInfo
              data={additionalData}
              onChange={(data) => {
                setAdditionalData(data);
                setHasUnsavedChanges(true);
              }}
            />
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          {currentStep === 3 ? (
            <>
              <button
                onClick={handleSkipAdditionalInfo}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
              >
                Заполнить позже
              </button>
              <button
                onClick={handleNextStep}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Завершить
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => currentStep > 1 && setCurrentStep((s) => (s - 1) as Step)}
                disabled={currentStep === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Назад
              </button>
              <button
                onClick={handleNextStep}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                Далее
              </button>
            </>
          )}
        </div>
      </div>

      {/* Close Warning Modal */}
      {showCloseWarning && (
        <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
              Закрыть форму?
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Все несохраненные данные будут потеряны. Вы уверены?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCloseWarning(false)}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmClose}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Компоненты для каждого шага
function Step1ProfileForm({
  data,
  onChange,
  jobTitles,
  professions,
}: {
  data: any;
  onChange: (data: any) => void;
  jobTitles: string[];
  professions: string[];
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onChange({ ...data, [e.target.name]: e.target.value });
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Основные данные профиля</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Фамилия *</label>
          <input
            type="text"
            name="lastName"
            value={data.lastName}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Имя *</label>
          <input
            type="text"
            name="firstName"
            value={data.firstName}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Отчество</label>
          <input
            type="text"
            name="middleName"
            value={data.middleName}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Дата рождения *</label>
          <input
            type="date"
            name="dateOfBirth"
            value={data.dateOfBirth}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Телефон *</label>
          <PhoneInput
            name="phone"
            value={data.phone}
            onChange={handleChange}
            placeholder="+7 (___) ___-__-__"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Адрес *</label>
          <AddressInput
            name="address"
            value={data.address}
            onChange={handleChange}
            placeholder="Регион, город, улица, дом, квартира"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Организация</label>
          <input
            type="text"
            name="organizationName"
            value={data.organizationName}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Должность *</label>
          <Autocomplete
            name="jobTitle"
            value={data.jobTitle}
            onChange={(value) => onChange({ ...data, jobTitle: value })}
            options={jobTitles}
            placeholder="Начните вводить должность..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Профессия *</label>
          <Autocomplete
            name="profession"
            value={data.profession}
            onChange={(value) => onChange({ ...data, profession: value })}
            options={professions}
            placeholder="Начните вводить профессию..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Образование *</label>
          <select
            value={data.education}
            onChange={(e) => onChange({ ...data, education: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="">Выберите</option>
            <option value="Начальное общее">Начальное общее</option>
            <option value="Основное общее (9 классов)">Основное общее (9 классов)</option>
            <option value="Среднее общее (11 классов)">Среднее общее (11 классов)</option>
            <option value="Среднее профессиональное">Среднее профессиональное</option>
            <option value="Высшее (бакалавриат)">Высшее (бакалавриат)</option>
            <option value="Высшее (специалитет)">Высшее (специалитет)</option>
            <option value="Высшее (магистратура)">Высшее (магистратура)</option>
            <option value="Аспирантура">Аспирантура</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function Step2DocumentsUpload({
  docs,
  onChange,
}: {
  docs: any;
  onChange: (docs: any) => void;
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Загрузка документов</h3>
      
      <div className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
          <label className="block text-sm font-medium mb-2">
            Заявление о вступлении *
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange({ ...docs, membership: file });
            }}
            className="w-full"
          />
          {docs.membership && (
            <p className="text-sm text-green-600 mt-2">
              ✓ {docs.membership.name}
            </p>
          )}
        </div>

        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
          <label className="block text-sm font-medium mb-2">
            Заявление о взносах *
          </label>
          <input
            type="file"
            accept=".pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onChange({ ...docs, contribution: file });
            }}
            className="w-full"
          />
          {docs.contribution && (
            <p className="text-sm text-green-600 mt-2">
              ✓ {docs.contribution.name}
            </p>
          )}
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          💡 Скачайте пустые бланки, заполните их, подпишите и загрузите обратно
        </p>
      </div>
    </div>
  );
}

function Step3AdditionalInfo({
  data,
  onChange,
}: {
  data: any;
  onChange: (data: any) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-2">Дополнительная информация</h3>
      
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
        <p className="text-sm text-green-800 dark:text-green-200">
          ✅ Документы успешно загружены! Теперь вы можете заполнить дополнительную информацию о себе, чтобы AI-бот мог лучше вас консультировать и давать персонализированные рекомендации. Эта информация необязательна и может быть заполнена позже.
        </p>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Занятость</label>
          <select
            value={data.employmentStatus}
            onChange={(e) => onChange({ ...data, employmentStatus: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="">Выберите</option>
            <option value="WORK">Работа</option>
            <option value="STUDY">Учеба</option>
            <option value="RETIREMENT">Пенсия</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Семейное положение</label>
          <select
            value={data.maritalStatus}
            onChange={(e) => onChange({ ...data, maritalStatus: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          >
            <option value="">Выберите</option>
            <option value="SINGLE">Не женат/Не замужем</option>
            <option value="MARRIED">Женат/Замужем</option>
            <option value="DIVORCED">В разводе</option>
            <option value="WIDOWED">Вдовец/Вдова</option>
            <option value="CIVIL_UNION">В гражданском браке</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Информация о супруге</label>
          <input
            type="text"
            value={data.spouseInfo}
            onChange={(e) => onChange({ ...data, spouseInfo: e.target.value })}
            placeholder="Имя, профессия"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div className="col-span-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={data.hasChildren}
              onChange={(e) => onChange({ ...data, hasChildren: e.target.checked })}
              className="rounded"
            />
            <span className="text-sm font-medium">У меня есть дети</span>
          </label>
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Хобби и увлечения</label>
          <textarea
            value={data.hobbies}
            onChange={(e) => onChange({ ...data, hobbies: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">О себе</label>
          <textarea
            value={data.aboutMe}
            onChange={(e) => onChange({ ...data, aboutMe: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Дополнительная информация</label>
          <textarea
            value={data.additionalInfo}
            onChange={(e) => onChange({ ...data, additionalInfo: e.target.value })}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
          />
        </div>
      </div>
    </div>
  );
}

