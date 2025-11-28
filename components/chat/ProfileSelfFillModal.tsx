"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import Autocomplete from "@/components/form/Autocomplete";
import EmailValidationField from "@/components/form/EmailValidationField";
import Step2ConfirmBasicData from "@/components/chat/Step2ConfirmBasicData";

interface ProfileSelfFillModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

interface Organization {
  id: string;
  name: string;
  type: string;
  level: number;
  fullPath: string;
  indentedName: string;
}

// Компонент выбора организации с поиском
function OrganizationSelect({
  organizations,
  selectedId,
  onSelect,
}: {
  organizations: Organization[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOrg = organizations.find((o) => o.id === selectedId);

  // Фильтрация организаций по поиску
  const filtered = search
    ? organizations.filter(
        (org) =>
          org.name.toLowerCase().includes(search.toLowerCase()) ||
          org.fullPath.toLowerCase().includes(search.toLowerCase())
      )
    : organizations;

  // Закрытие при клике вне компонента
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-sm font-medium mb-1">Организация *</label>
      
      {/* Поле ввода для поиска */}
      <input
        type="text"
        value={isOpen ? search : (selectedOrg?.name || "")}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Начните вводить название организации..."
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
      />
      
      {/* Выпадающий список */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-gray-500 dark:text-gray-400">
              {organizations.length === 0 ? "Загрузка..." : "Ничего не найдено"}
            </div>
          ) : (
            filtered.slice(0, 50).map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => {
                  onSelect(org.id);
                  setSearch("");
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-gray-700 ${
                  org.id === selectedId ? "bg-blue-100 dark:bg-gray-600" : ""
                }`}
              >
                <div className="font-medium text-sm">{org.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {org.fullPath}
                </div>
              </button>
            ))
          )}
          {filtered.length > 50 && (
            <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 border-t">
              Показано 50 из {filtered.length}. Уточните поиск.
            </div>
          )}
        </div>
      )}
      
      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
        💡 Введите название организации для поиска
      </p>
      
      {selectedOrg && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          ✓ Выбрано: {selectedOrg.fullPath}
        </p>
      )}
    </div>
  );
}

type Step = 1 | 2 | 3 | 4;

export function ProfileSelfFillModal({
  isOpen,
  onClose,
  sessionId,
}: ProfileSelfFillModalProps) {
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showCloseWarning, setShowCloseWarning] = useState(false);
  const [saving, setSaving] = useState(false);

  // Справочники профессий и должностей
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);

  // Справочник организаций
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  // Данные формы
  const [profileData, setProfileData] = useState({
    firstName: "",
    lastName: "",
    middleName: "",
    dateOfBirth: "",
    phone: "",
    email: "",
    address: "",
    jobTitle: "",
    profession: "",
    education: "",
    organizationId: "", // Теперь ID вместо имени
  });

  // Статус верификации email
  const [emailVerified, setEmailVerified] = useState<Date | null>(null);
  const [originalEmail, setOriginalEmail] = useState<string>("");

  // Загрузка данных пользователя и справочников
  useEffect(() => {
    const loadData = async () => {
      try {
        // Загружаем справочники
        const dictResponse = await fetch("/api/dictionaries");
        if (dictResponse.ok) {
          const data = await dictResponse.json();
          setJobTitles(data.jobTitles || []);
          setProfessions(data.professions || []);
        }

        // Загружаем организации
        const orgsResponse = await fetch("/api/organizations");
        if (orgsResponse.ok) {
          const orgsData = await orgsResponse.json();
          console.log("[ProfileModal] Loaded organizations:", orgsData);
          
          // Фильтруем только первичные организации (ППО) для заявлений
          const primaryOrgs = (orgsData.flatList || []).filter(
            (org: any) => org.type === "PRIMARY"
          );
          
          console.log("[ProfileModal] Filtered PRIMARY organizations:", primaryOrgs.length);
          setOrganizations(primaryOrgs);
        } else {
          console.error("[ProfileModal] Failed to load organizations:", await orgsResponse.text());
        }

        // Загружаем существующие данные пользователя
        const userResponse = await fetch("/api/user/profile");
        if (userResponse.ok) {
          const userData = await userResponse.json();
          console.log("[ProfileModal] Loaded user data:", userData);
          
          // API возвращает user напрямую, без обёртки
          const user = userData.user || userData;
          
          // Заполняем форму существующими данными
          setProfileData({
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            middleName: user.middleName || "",
            dateOfBirth: user.dateOfBirth 
              ? new Date(user.dateOfBirth).toISOString().split('T')[0] 
              : "",
            phone: user.phone || "",
            email: user.email || "",
            address: user.address || "",
            jobTitle: user.jobTitle || "",
            profession: user.profession || "",
            education: user.education || "",
            organizationId: user.organizationId || "",
          });

          // Сохраняем статус верификации email
          setEmailVerified(user.emailVerified ? new Date(user.emailVerified) : null);
          setOriginalEmail(user.email || "");

          // Заполняем дополнительные данные если есть
          setAdditionalData({
            employmentStatus: user.employmentStatus || "",
            maritalStatus: user.maritalStatus || "",
            spouseInfo: user.spouseInfo || "",
            hasChildren: user.hasChildren || false,
            hobbies: user.hobbies || "",
            aboutMe: user.aboutMe || "",
            additionalInfo: user.additionalInfo || "",
          });
        }
      } catch (error) {
        console.error("[ProfileModal] Failed to load data:", error);
      }
    };

    if (isOpen) {
      loadData();
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
    // Разрешаем закрывать модалку в любой момент без предупреждений
    onClose();
  }, [onClose]);

  const handleConfirmClose = () => {
    setShowCloseWarning(false);
    onClose();
  };

  const handleNextStep = async () => {
    if (currentStep === 1) {
      // Шаг 1: Валидация и сохранение основных данных
      const isValid = validateStep1();
      if (!isValid) return;
      
      await saveProfileData();
      setCurrentStep(2); // → К подтверждению данных
    } else if (currentStep === 2) {
      // Шаг 2: Подтверждение данных и генерация PDF документов
      setSaving(true);
      try {
        // Отправляем команду на генерацию документов
        await sendCompletionMessage();
        alert("✅ Документы успешно сгенерированы! Скачайте их в разделе 'Документы', распечатайте, подпишите и загрузите на следующем шаге.");
        setCurrentStep(3); // → К загрузке документов
      } catch (error) {
        console.error("Error generating documents:", error);
        alert("Ошибка при генерации документов. Попробуйте еще раз.");
      } finally {
        setSaving(false);
      }
    } else if (currentStep === 3) {
      // Шаг 3: Проверка загрузки подписанных документов
      const isValid = validateStep2();
      if (!isValid) return;
      
      await uploadDocuments();
      setCurrentStep(4); // → К дополнительной информации
    } else if (currentStep === 4) {
      // Шаг 4: Сохранение дополнительной информации и завершение
      await saveAdditionalData();
      setHasUnsavedChanges(false);
      onClose();
    }
  };

  const handleSkipAdditionalInfo = async () => {
    // Пропускаем заполнение дополнительной информации и завершаем
    setHasUnsavedChanges(false);
    onClose();
  };

  const handleBackToEdit = () => {
    // Возврат к первому шагу для редактирования
    setCurrentStep(1);
  };

  const validateStep1 = (): boolean => {
    // Проверка обязательных полей шага 1
    if (
      !profileData.firstName ||
      !profileData.lastName ||
      !profileData.dateOfBirth ||
      !profileData.phone ||
      !profileData.email ||
      !profileData.address ||
      !profileData.jobTitle ||
      !profileData.profession ||
      !profileData.education ||
      !profileData.organizationId
    ) {
      alert("Заполните все обязательные поля");
      return false;
    }
    
    // Проверка формата email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(profileData.email)) {
      alert("Введите корректный email адрес");
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
    
    // Проверяем, что организация выбрана из списка
    const selectedOrg = organizations.find(org => org.id === profileData.organizationId);
    if (!selectedOrg) {
      alert("Выберите организацию из списка");
      return false;
    }
    
    // Проверяем, что выбрана первичная организация (ППО)
    if (selectedOrg.type !== "PRIMARY") {
      alert(
        "⚠️ Заявление можно подать только в первичную профсоюзную организацию (ППО).\n\n" +
        `Вы выбрали: ${selectedOrg.fullPath}\n\n` +
        "Пожалуйста, выберите ППО из списка."
      );
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
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData),
      });

      if (!response.ok) throw new Error("Failed to save profile");

      // Если email изменился или это новый email - отправляем письмо с подтверждением
      if (profileData.email && profileData.email !== originalEmail) {
        console.log("[ProfileModal] Email changed, sending verification email");
        
        try {
          const verifyResponse = await fetch("/api/user/send-verification-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: profileData.email }),
          });

          if (verifyResponse.ok) {
            const verifyData = await verifyResponse.json();
            console.log("[ProfileModal] Verification email sent:", verifyData.message);
            
            // Обновляем originalEmail и сбрасываем emailVerified
            setOriginalEmail(profileData.email);
            setEmailVerified(null);
            
            // Показываем уведомление
            alert(
              "Профиль сохранен!\n\n" +
              "На указанный email отправлено письмо с подтверждением. " +
              "Пожалуйста, проверьте почту и перейдите по ссылке для активации доступа к скидкам."
            );
          } else {
            const error = await verifyResponse.json();
            console.error("[ProfileModal] Failed to send verification email:", error);
          }
        } catch (emailError) {
          console.error("[ProfileModal] Error sending verification email:", emailError);
          // Не блокируем сохранение профиля из-за ошибки отправки письма
        }
      }
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
                style={{ width: `${Math.round(((currentStep - 1) / 4) * 100 + 25)}%` }}
              />
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Шаг {currentStep} из 4
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
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-semibold text-xs
                    ${
                      currentStep >= step
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                    }
                  `}
                >
                  {step}
                </div>
                <div className="ml-2 flex-1">
                  <p className="text-xs font-medium text-gray-900 dark:text-white">
                    {step === 1 && "Основные"}
                    {step === 2 && "Проверка"}
                    {step === 3 && "Документы"}
                    {step === 4 && "Доп. инфо"}
                  </p>
                </div>
                {step < 4 && (
                  <div
                    className={`h-1 flex-1 mx-2 ${
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
              organizations={organizations}
              emailVerified={emailVerified}
              setEmailVerified={setEmailVerified}
              originalEmail={originalEmail}
              saving={saving}
              setSaving={setSaving}
            />
          )}

          {currentStep === 2 && (
            <Step2ConfirmBasicData
              profileData={profileData}
              organizations={organizations.map((org) => ({
                id: org.id,
                name: org.name,
                fullPath: org.fullPath,
              }))}
              onBackToEdit={handleBackToEdit}
            />
          )}

          {currentStep === 3 && (
            <Step2DocumentsUpload
              docs={uploadedDocs}
              onChange={(docs) => {
                setUploadedDocs(docs);
                setHasUnsavedChanges(true);
              }}
            />
          )}

          {currentStep === 4 && (
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
          {currentStep === 2 ? (
            // Шаг 2: Подтверждение данных перед генерацией
            <>
              <button
                onClick={handleBackToEdit}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                ← Исправить
              </button>
              <button
                onClick={handleNextStep}
                disabled={saving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 disabled:bg-gray-400"
              >
                {saving ? "Генерация..." : "✓ Подтвердить и сгенерировать документы"}
              </button>
            </>
          ) : currentStep === 4 ? (
            // Шаг 4: Дополнительная информация (опционально)
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
            // Шаги 1 и 3: Обычная навигация
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
  organizations,
  emailVerified,
  setEmailVerified,
  originalEmail,
  saving,
  setSaving,
}: {
  data: any;
  onChange: (data: any) => void;
  jobTitles: string[];
  professions: string[];
  organizations: Array<{
    id: string;
    name: string;
    type: string;
    level: number;
    fullPath: string;
    indentedName: string;
  }>;
  emailVerified: Date | null;
  setEmailVerified: (date: Date | null) => void;
  originalEmail: string;
  saving: boolean;
  setSaving: (value: boolean) => void;
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

        <EmailValidationField
          email={data.email}
          emailVerified={emailVerified}
          onEmailChange={(email) => onChange({ ...data, email })}
          onVerified={() => {
            // Обновляем статус верификации после успешной проверки PIN
            const now = new Date();
            setEmailVerified(now);
          }}
        />

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

        <OrganizationSelect
          organizations={organizations}
          selectedId={data.organizationId}
          onSelect={(orgId) => onChange({ ...data, organizationId: orgId })}
        />

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
  const [generatedDocs, setGeneratedDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Загружаем сгенерированные документы
  useEffect(() => {
    async function loadDocuments() {
      try {
        const response = await fetch("/api/documents");
        if (response.ok) {
          const data = await response.json();
          // Фильтруем только сгенерированные документы
          const generated = data.filter((doc: any) => 
            doc.status === "GENERATED" && 
            (doc.type === "MEMBERSHIP_APPLICATION" || doc.type === "CONTRIBUTION_APPLICATION")
          );
          setGeneratedDocs(generated);
        }
      } catch (error) {
        console.error("Failed to load documents:", error);
      } finally {
        setLoading(false);
      }
    }
    loadDocuments();
  }, []);

  const membershipDoc = generatedDocs.find(d => d.type === "MEMBERSHIP_APPLICATION");
  const contributionDoc = generatedDocs.find(d => d.type === "CONTRIBUTION_APPLICATION");

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold mb-4">Загрузка подписанных документов</h3>
      
      {/* Инструкция */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
          📄 Инструкция:
        </h4>
        <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
          <li>Скачайте сгенерированные документы ниже</li>
          <li>Распечатайте их</li>
          <li>Подпишите и поставьте дату</li>
          <li>Отсканируйте или сфотографируйте подписанные документы</li>
          <li>Загрузите обратно в форму ниже</li>
        </ol>
      </div>

      {/* Скачивание сгенерированных документов */}
      {!loading && (membershipDoc || contributionDoc) && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <h4 className="font-semibold text-green-900 dark:text-green-100 mb-3">
            ✅ Сгенерированные документы для скачивания:
          </h4>
          <div className="space-y-2">
            {membershipDoc && (
              <a
                href={`/api/documents/${membershipDoc.id}/download`}
                download
                className="flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>📄 Скачать заявление о вступлении в профсоюз</span>
              </a>
            )}
            {contributionDoc && (
              <a
                href={`/api/documents/${contributionDoc.id}/download`}
                download
                className="flex items-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>📄 Скачать заявление о перечислении членских взносов</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Загрузка подписанных документов */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-900 dark:text-white mb-3">
          Загрузите подписанные документы:
        </h4>
        
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6">
          <label className="block text-sm font-medium mb-2">
            Заявление о вступлении (подписанное) *
          </label>
          <input
            type="file"
            accept=".pdf,image/*"
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
            Заявление о взносах (подписанное) *
          </label>
          <input
            type="file"
            accept=".pdf,image/*"
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

