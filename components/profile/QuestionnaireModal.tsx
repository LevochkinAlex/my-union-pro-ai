"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import DateInput from "@/components/form/DateInput";
import Autocomplete from "@/components/form/Autocomplete";
import OrganizationAutocomplete from "@/components/form/OrganizationAutocomplete";
import EmailValidationField from "@/components/form/EmailValidationField";
import AvatarUpload from "@/components/profile/AvatarUpload";
import ChangePhoneModal from "@/components/profile/ChangePhoneModal";
import Select from "@/components/ui/Select";
import { EDUCATION_LEVELS } from "@/lib/constants/education";
import { useAlert } from "@/components/ui/Alert";
import { Download, Upload, Check, X, Edit2 } from "lucide-react";

interface QuestionnaireModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

interface FormData {
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  dateOfBirth: string;
  address: string;
  email: string;
  jobTitle: string;
  profession: string;
  education: string;
  organizationId: string;
  avatarUrl: string | null;
}

interface Document {
  id: string;
  type: string;
  title: string;
  fileName: string;
  status: string;
}

export default function QuestionnaireModal({
  isOpen,
  onClose,
  onComplete,
}: QuestionnaireModalProps) {
  const { showAlert, AlertComponent } = useAlert();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSavedField, setLastSavedField] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    middleName: "",
    phone: "",
    dateOfBirth: "",
    address: "",
    email: "",
    jobTitle: "",
    profession: "",
    education: "",
    organizationId: "",
    avatarUrl: null,
  });
  const [emailVerified, setEmailVerified] = useState<Date | null>(null);

  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; fullPath?: string; indentedName?: string; type?: string; level?: number }>>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [professions, setProfessions] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isChangePhoneModalOpen, setIsChangePhoneModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      console.log("[QuestionnaireModal] Modal opened, loading data...");
      loadData();
    } else {
      console.log("[QuestionnaireModal] Modal closed");
      // НЕ сбрасываем форму при закрытии, чтобы данные сохранились для следующего открытия
      // setFormData({
      //   firstName: "",
      //   lastName: "",
      //   middleName: "",
      //   phone: "",
      //   dateOfBirth: "",
      //   address: "",
      //   email: "",
      //   jobTitle: "",
      //   profession: "",
      //   education: "",
      //   organizationId: "",
      //   avatarUrl: null,
      // });
      // setCurrentStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const loadData = async () => {
    try {
      console.log("[QuestionnaireModal] loadData called");
      setIsLoading(true);
      console.log("[QuestionnaireModal] Fetching profile data from /api/profile...");
      const [profileRes, orgsRes, jobTitlesRes, professionsRes, documentsRes] = await Promise.all([
        fetch("/api/profile"),
        fetch("/api/organizations"),
        fetch("/api/dictionaries/job-titles"),
        fetch("/api/dictionaries/professions"),
        fetch("/api/documents"),
      ]);

      console.log("[QuestionnaireModal] Profile response status:", profileRes.status, profileRes.ok);

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        console.log("[QuestionnaireModal] Full profile data from API:", profileData);
        console.log("[QuestionnaireModal] Loading profile data:", {
          firstName: profileData.user?.firstName,
          lastName: profileData.user?.lastName,
          jobTitle: profileData.user?.jobTitle,
          profession: profileData.user?.profession,
          organizationId: profileData.user?.organizationId,
          organization: profileData.user?.organization,
          phone: profileData.user?.phone,
          email: profileData.user?.email,
        });
        const loadedData = {
          firstName: profileData.user?.firstName || "",
          lastName: profileData.user?.lastName || "",
          middleName: profileData.user?.middleName || "",
          phone: profileData.user?.phone || "",
          dateOfBirth: profileData.user?.dateOfBirth
            ? new Date(profileData.user.dateOfBirth).toISOString().split("T")[0]
            : "",
          address: profileData.user?.address || "",
          email: profileData.user?.email || "",
          jobTitle: profileData.user?.jobTitle || "",
          profession: profileData.user?.profession || "",
          education: profileData.user?.education || "",
          organizationId: profileData.user?.organizationId || profileData.user?.organization?.id || "",
          avatarUrl: profileData.user?.avatarUrl || null,
        };
        console.log("[QuestionnaireModal] Setting form data:", loadedData);
        setFormData(loadedData);
        setEmailVerified(profileData.user?.emailVerified ? new Date(profileData.user.emailVerified) : null);
      } else {
        console.error("[QuestionnaireModal] Failed to load profile:", profileRes.status, profileRes.statusText);
        const errorText = await profileRes.text();
        console.error("[QuestionnaireModal] Error response:", errorText);
      }

      if (orgsRes.ok) {
        const orgsData = await orgsRes.json();
        // API возвращает flatList, а не organizations
        setOrganizations(orgsData.flatList || orgsData.organizations || []);
      }

      if (jobTitlesRes.ok) {
        const jobTitlesData = await jobTitlesRes.json();
        setJobTitles(jobTitlesData.items || []);
      }

      if (professionsRes.ok) {
        const professionsData = await professionsRes.json();
        setProfessions(professionsData.items || []);
      }

      if (documentsRes.ok) {
        const documentsData = await documentsRes.json();
        setDocuments(documentsData.documents || []);
      }
    } catch (error) {
      console.error("[QuestionnaireModal] Error loading data:", error);
      showAlert({
        message: "Ошибка при загрузке данных профиля. Пожалуйста, обновите страницу.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Функция автосохранения полей
  const autoSaveField = async (fieldName: string, value: any) => {
    if (autoSaving) return;

    setAutoSaving(true);
    setLastSavedField(fieldName);

    try {
      const payload: any = {};
      if (fieldName === 'organizationId') {
        payload.organizationId = value || null;
      } else {
        payload[fieldName] = value;
      }

      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Не удалось сохранить");
      }

      console.log(`[QuestionnaireModal] Auto-saved field ${fieldName}:`, value);
    } catch (error) {
      console.error(`[QuestionnaireModal] Error auto-saving field ${fieldName}:`, error);
      showAlert({
        message: `Ошибка при сохранении поля ${fieldName}. Попробуйте еще раз.`,
        type: "error",
      });
    } finally {
      setAutoSaving(false);
      setTimeout(() => setLastSavedField(null), 2000);
    }
  };

  const handleFieldBlur = (fieldName: string, value: any) => {
    autoSaveField(fieldName, value);
  };

  const handleAvatarSave = async (croppedImageBlob: Blob) => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("avatar", croppedImageBlob, "avatar.jpg");

      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        body: formDataToSend,
      });

      if (!response.ok) {
        throw new Error("Ошибка при загрузке фото");
      }

      const data = await response.json();
      setFormData({ ...formData, avatarUrl: data.avatarUrl });
      showAlert({ message: "Фото успешно загружено", type: "success" });
      // Перезагружаем данные после загрузки аватара
      await loadData();
    } catch (error) {
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при загрузке фото",
        type: "error",
      });
      throw error;
    }
  };

  const handleSaveStep1 = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          middleName: formData.middleName,
          phone: formData.phone,
          dateOfBirth: formData.dateOfBirth,
          address: formData.address,
          email: formData.email,
          jobTitle: formData.jobTitle,
          profession: formData.profession,
          education: formData.education,
          organizationId: formData.organizationId || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Ошибка при сохранении");
      }

      // Перезагружаем данные после сохранения, чтобы убедиться, что все синхронизировано
      await loadData();
      setCurrentStep(2);
    } catch (error) {
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при сохранении анкеты",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateDocuments = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch("/api/documents/generate", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Ошибка при генерации документов");
      }

      showAlert({ message: "Документы успешно сгенерированы", type: "success" });
      await loadData(); // Перезагружаем документы
    } catch (error) {
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при генерации документов",
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDocument = async (documentId: string, fileName: string) => {
    try {
      const response = await fetch(`/api/documents/${documentId}/download`);
      if (!response.ok) throw new Error("Ошибка при скачивании");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при скачивании документа",
        type: "error",
      });
    }
  };

  const handleUploadSigned = async (documentId: string, file: File) => {
    try {
      const formDataToSend = new FormData();
      formDataToSend.append("file", file);
      formDataToSend.append("documentId", documentId);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setUploadProgress((prev) => ({ ...prev, [documentId]: percentComplete }));
        }
      });

      return new Promise<void>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          if (xhr.status === 200) {
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[documentId];
              return newProgress;
            });
            showAlert({ message: "Документ успешно загружен", type: "success" });
            loadData();
            resolve();
          } else {
            reject(new Error("Ошибка при загрузке"));
          }
        });

        xhr.addEventListener("error", () => reject(new Error("Ошибка при загрузке")));
        xhr.open("POST", "/api/documents/upload");
        xhr.send(formDataToSend);
      });
    } catch (error) {
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при загрузке документа",
        type: "error",
      });
    }
  };

  const handleComplete = () => {
    showAlert({ message: "Анкета успешно заполнена", type: "success" });
    onComplete?.();
    onClose();
  };

  const canProceedToStep2 = () => {
    return (
      formData.firstName &&
      formData.lastName &&
      formData.dateOfBirth &&
      formData.phone &&
      formData.email &&
      formData.address &&
      formData.organizationId &&
      formData.jobTitle &&
      formData.profession &&
      formData.education
    );
  };

  const selectedOrganization = organizations.find((org) => org.id === formData.organizationId);

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose}>
        <div className="p-8 text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-gray-600 dark:text-gray-400">Загрузка данных...</p>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} className="max-w-4xl">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Заполнение анкеты для вступления в профсоюз
            </h2>
            {autoSaving && (
              <span className="text-sm text-blue-600 dark:text-blue-400">
                Сохранение...
              </span>
            )}
            {lastSavedField && !autoSaving && (
              <span className="text-sm text-green-600 dark:text-green-400">
                ✓ Сохранено
              </span>
            )}
          </div>

          {/* Прогресс */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Шаг {currentStep} из 4
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {Math.round((currentStep / 4) * 100)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-300"
                style={{ width: `${(currentStep / 4) * 100}%` }}
              />
            </div>
          </div>

          {/* Шаг 1: Основная информация */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Основная информация
              </h3>

              {/* Загрузка аватара */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Фото профиля
                </label>
                <AvatarUpload
                  currentAvatarUrl={formData.avatarUrl}
                  onSave={handleAvatarSave}
                  userName={[formData.lastName, formData.firstName, formData.middleName].filter(Boolean).join(" ") || undefined}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Фамилия <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Имя <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    onBlur={() => handleFieldBlur("firstName", formData.firstName)}
                    className="w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Отчество
                  </label>
                  <input
                    type="text"
                    value={formData.middleName}
                    onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                    onBlur={() => handleFieldBlur("middleName", formData.middleName)}
                    className="w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Дата рождения <span className="text-red-500">*</span>
                  </label>
                  <DateInput
                    value={formData.dateOfBirth}
                    onChange={(value) => setFormData({ ...formData, dateOfBirth: value })}
                    onBlur={() => handleFieldBlur("dateOfBirth", formData.dateOfBirth)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Телефон <span className="text-red-500">*</span>
                  </label>
                  <PhoneInput
                    value={formData.phone}
                    onChange={(value) => setFormData({ ...formData, phone: value })}
                    onBlur={() => handleFieldBlur("phone", formData.phone)}
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <button
                      type="button"
                      onClick={() => setIsChangePhoneModalOpen(true)}
                      className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline"
                    >
                      Изменить номер
                    </button>
                  </p>
                </div>
                <div>
                  <EmailValidationField
                    email={formData.email}
                    emailVerified={emailVerified}
                    onEmailChange={(value) => {
                      setFormData({ ...formData, email: value });
                    }}
                    onVerified={() => {
                      setEmailVerified(new Date());
                      // Сохраняем email после верификации
                      if (formData.email) {
                        handleFieldBlur("email", formData.email);
                      }
                    }}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Адрес <span className="text-red-500">*</span>
                  </label>
                  <AddressInput
                    value={formData.address}
                    onChange={(value) => setFormData({ ...formData, address: value })}
                    onBlur={() => handleFieldBlur("address", formData.address)}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Должность <span className="text-red-500">*</span>
                  </label>
                  <Autocomplete
                    value={formData.jobTitle}
                    onChange={(value) => setFormData({ ...formData, jobTitle: value })}
                    onBlur={() => handleFieldBlur("jobTitle", formData.jobTitle)}
                    options={jobTitles}
                    placeholder="Начните вводить должность..."
                    className="w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Организация <span className="text-red-500">*</span>
                  </label>
                  <OrganizationAutocomplete
                    value={formData.organizationId}
                    onChange={(organizationId) => {
                      setFormData({ ...formData, organizationId });
                      handleFieldBlur("organizationId", organizationId || null);
                    }}
                    options={organizations}
                    placeholder="Начните вводить название организации..."
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Профессия <span className="text-red-500">*</span>
                  </label>
                  <Autocomplete
                    value={formData.profession}
                    onChange={(value) => setFormData({ ...formData, profession: value })}
                    onBlur={() => handleFieldBlur("profession", formData.profession)}
                    options={professions}
                    placeholder="Начните вводить профессию..."
                    className="w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Образование <span className="text-red-500">*</span>
                  </label>
                  <Select
                    value={formData.education}
                    onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                    onBlur={() => handleFieldBlur("education", formData.education)}
                  >
                    <option value="">Выберите образование</option>
                    {EDUCATION_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Шаг 2: Сверка информации */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Проверьте введенные данные
              </h3>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 dark:border-gray-700 dark:bg-gray-800/50">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        ФИО:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">
                        {[formData.lastName, formData.firstName, formData.middleName]
                          .filter(Boolean)
                          .join(" ")}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Дата рождения:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">
                        {formData.dateOfBirth
                          ? new Date(formData.dateOfBirth).toLocaleDateString("ru-RU")
                          : ""}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Телефон:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.phone}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Email:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.email}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Адрес:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.address}</p>
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Организация:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">
                        {selectedOrganization?.name || ""}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Должность:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.jobTitle}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Профессия:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.profession}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Образование:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.education}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Шаг 3: Генерация и загрузка документов */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Генерация и загрузка документов
              </h3>

              {documents.length === 0 ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/40 dark:bg-blue-900/20">
                  <p className="mb-4 text-gray-700 dark:text-gray-300">
                    Нажмите кнопку ниже, чтобы сгенерировать документы для вступления в профсоюз.
                  </p>
                  <button
                    onClick={handleGenerateDocuments}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Генерация...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Сгенерировать документы
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {doc.title}
                          </h4>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {doc.fileName}
                          </p>
                        </div>
                        <div className="ml-4 flex gap-2">
                          <button
                            onClick={() => handleDownloadDocument(doc.id, doc.fileName)}
                            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                          >
                            <Download className="h-4 w-4" />
                            Скачать
                          </button>
                          {doc.status === "GENERATED" && (
                            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700">
                              <Upload className="h-4 w-4" />
                              Загрузить подписанный
                              <input
                                type="file"
                                accept=".pdf"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleUploadSigned(doc.id, file);
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>
                      {uploadProgress[doc.id] !== undefined && (
                        <div className="mt-3">
                          <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                            <div
                              className="h-full rounded-full bg-purple-600 transition-all"
                              style={{ width: `${uploadProgress[doc.id]}%` }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {uploadProgress[doc.id]}%
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Шаг 4: Завершение */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="rounded-lg border border-green-200 bg-green-50 p-6 dark:border-green-900/40 dark:bg-green-900/20">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600">
                    <Check className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Анкета успешно заполнена!
                    </h3>
                    <p className="mt-1 text-gray-700 dark:text-gray-300">
                      Ваши документы отправлены на проверку. Мы свяжемся с вами в ближайшее время.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Кнопки навигации */}
          <div className="mt-8 flex justify-between">
            <button
              onClick={() => {
                if (currentStep > 1) {
                  setCurrentStep(currentStep - 1);
                } else {
                  onClose();
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
            >
              {currentStep > 1 ? (
                <>
                  <X className="h-4 w-4" />
                  Назад
                </>
              ) : (
                "Отмена"
              )}
            </button>
            {currentStep === 1 && (
              <button
                onClick={handleSaveStep1}
                disabled={!canProceedToStep2() || isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Сохранение...
                  </>
                ) : (
                  <>
                    Далее
                    <Check className="h-4 w-4" />
                  </>
                )}
              </button>
            )}
            {currentStep === 2 && (
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentStep(1)}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  <Edit2 className="h-4 w-4" />
                  Редактировать
                </button>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700"
                >
                  Продолжить
                  <Check className="h-4 w-4" />
                </button>
              </div>
            )}
            {currentStep === 3 && (
              <button
                onClick={() => setCurrentStep(4)}
                disabled={documents.length === 0 || documents.some(doc => doc.status === "GENERATED")}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Далее
                <Check className="h-4 w-4" />
              </button>
            )}
            {currentStep === 4 && (
              <button
                onClick={handleComplete}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-green-700"
              >
                Завершить
                <Check className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </Modal>
      <ChangePhoneModal
        isOpen={isChangePhoneModalOpen}
        onClose={() => setIsChangePhoneModalOpen(false)}
        currentPhone={formData.phone}
        onPhoneChanged={(newPhone) => {
          setFormData({ ...formData, phone: newPhone });
          setIsChangePhoneModalOpen(false);
          showAlert({ message: "Номер телефона успешно изменен", type: "success" });
        }}
      />
      {AlertComponent}
    </>
  );
}
