"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import PhoneInput from "@/components/form/PhoneInput";
import AddressInput from "@/components/form/AddressInput";
import DateInput from "@/components/form/DateInput";
import Autocomplete from "@/components/form/Autocomplete";
import OrganizationAutocomplete from "@/components/form/OrganizationAutocomplete";
import EmailValidationField from "@/components/form/EmailValidationField";
import AvatarUpload from "@/components/profile/AvatarUpload";
import ChangePhoneModal from "@/components/profile/ChangePhoneModal";
import WorkplaceSearch from "@/components/profile/WorkplaceSearch";
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
  workplace: string;
  workplaceInn: string;
  directorName: string;
  directorPosition: string;
  jobTitle: string;
  organizationId: string;
  avatarUrl: string | null;
}

interface Document {
  id: string;
  type: string;
  title: string;
  description?: string;
  fileName: string;
  status: string;
  signedFilePath?: string | null;
  verificationStatus?: string | null;
  verificationMessage?: string | null;
}

export default function QuestionnaireModal({
  isOpen,
  onClose,
  onComplete,
}: QuestionnaireModalProps) {
  const router = useRouter();
  const { showAlert, AlertComponent } = useAlert();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadingDocIds, setDownloadingDocIds] = useState<Set<string>>(new Set());
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
    workplace: "",
    workplaceInn: "",
    directorName: "",
    directorPosition: "",
    jobTitle: "",
    organizationId: "",
    avatarUrl: null,
  });
  const [emailVerified, setEmailVerified] = useState<Date | null>(null);

  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; fullPath?: string; indentedName?: string; type?: string; level?: number }>>([]);
  const [jobTitles, setJobTitles] = useState<string[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [isChangePhoneModalOpen, setIsChangePhoneModalOpen] = useState(false);
  const [isExistingMember, setIsExistingMember] = useState(false);

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
      
      // Используем Promise.allSettled, чтобы один запрос не блокировал остальные
      const results = await Promise.allSettled([
        fetch("/api/profile"),
        fetch("/api/organizations"),
        fetch("/api/dictionaries"),
        fetch("/api/documents"),
      ]);
      
      // Обрабатываем результаты Promise.allSettled
      const profileRes = results[0].status === 'fulfilled' 
        ? results[0].value 
        : { ok: false, status: 500, statusText: 'Request failed', text: () => Promise.resolve((results[0] as PromiseRejectedResult).reason?.message || 'Unknown error'), json: () => Promise.resolve({}) };
      const orgsRes = results[1].status === 'fulfilled' 
        ? results[1].value 
        : { ok: false, status: 500, statusText: 'Request failed', text: () => Promise.resolve((results[1] as PromiseRejectedResult).reason?.message || 'Unknown error'), json: () => Promise.resolve({}) };
      const dictionariesRes = results[2].status === 'fulfilled' 
        ? results[2].value 
        : { ok: false, status: 500, statusText: 'Request failed', text: () => Promise.resolve((results[2] as PromiseRejectedResult).reason?.message || 'Unknown error'), json: () => Promise.resolve({}) };
      const documentsRes = results[3].status === 'fulfilled' 
        ? results[3].value 
        : { ok: false, status: 500, statusText: 'Request failed', text: () => Promise.resolve((results[3] as PromiseRejectedResult).reason?.message || 'Unknown error'), json: () => Promise.resolve({ documents: [] }) };

      console.log("[QuestionnaireModal] Profile response status:", profileRes.status, profileRes.ok);

      let loadedData: FormData | null = null;
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
        loadedData = {
          firstName: profileData.user?.firstName || "",
          lastName: profileData.user?.lastName || "",
          middleName: profileData.user?.middleName || "",
          phone: profileData.user?.phone || "",
          dateOfBirth: profileData.user?.dateOfBirth
            ? new Date(profileData.user.dateOfBirth).toISOString().split("T")[0]
            : "",
          address: profileData.user?.address || "",
          email: profileData.user?.email || "",
          workplace: profileData.user?.workplace || "",
          workplaceInn: profileData.user?.workplaceInn || "",
          directorName: profileData.user?.directorName || "",
          directorPosition: profileData.user?.directorPosition || "",
          jobTitle: profileData.user?.jobTitle || "",
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

      if (dictionariesRes.ok) {
        const dictionariesData = await dictionariesRes.json();
        const titles = dictionariesData.jobTitles || [];
        console.log("[QuestionnaireModal] Loaded job titles:", titles.length);
        setJobTitles(titles);
      } else {
        console.error("[QuestionnaireModal] Failed to load dictionaries:", dictionariesRes.status);
      }

      let loadedDocs: Document[] = [];
      if (documentsRes.ok) {
        const documentsData = await documentsRes.json();
        console.log("[QuestionnaireModal] Loaded documents:", documentsData.documents?.length || 0);
        loadedDocs = documentsData.documents || [];
        setDocuments(loadedDocs);
      } else {
        console.error("[QuestionnaireModal] Failed to load documents:", documentsRes.status, documentsRes.statusText);
        const errorText = await documentsRes.text();
        console.error("[QuestionnaireModal] Documents error response:", errorText);
        // Устанавливаем пустой массив, чтобы не было ошибок в UI
        setDocuments([]);
      }

      // Определяем начальный шаг на основе заполненности данных
      if (loadedData) {
        // Проверяем все обязательные поля, которые требует API /api/documents/generate
        const isProfileComplete = !!(
          loadedData.firstName &&
          loadedData.lastName &&
          loadedData.phone &&
          loadedData.dateOfBirth &&
          loadedData.address &&
          loadedData.workplace &&
          loadedData.organizationId &&
          loadedData.jobTitle
        );

        // Проверяем наличие документов
        const hasDocuments = loadedDocs.length > 0;
        
        // Проверяем подписаны ли документы
        const allDocsSigned = loadedDocs.length > 0 && 
          loadedDocs.every((doc: Document) => doc.signedFilePath);

        // Определяем шаг
        let initialStep = 1;
        if (allDocsSigned) {
          initialStep = 4; // Всё готово
        } else if (hasDocuments) {
          initialStep = 3; // Документы сгенерированы, нужно подписать
        } else if (isProfileComplete) {
          initialStep = 2; // Профиль заполнен, сверка данных
        }
        
        setCurrentStep(initialStep);
        
        console.log("[QuestionnaireModal] Determined initial step:", {
          isProfileComplete,
          hasDocuments,
          allDocsSigned,
          initialStep
        });
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
          workplace: formData.workplace,
          workplaceInn: formData.workplaceInn,
          directorName: formData.directorName,
          directorPosition: formData.directorPosition,
          jobTitle: formData.jobTitle,
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
      console.log("[QuestionnaireModal] Запрос на генерацию документов...");
      const response = await fetch("/api/documents/generate", {
        method: "POST",
      });

      const data = await response.json();
      console.log("[QuestionnaireModal] Ответ сервера:", { status: response.status, ok: response.ok, data });

      if (!response.ok) {
        // Формируем понятное сообщение с указанием недостающих полей
        let errorMessage = data.error || "Ошибка при генерации документов";
        if (data.missingFields && data.missingFields.length > 0) {
          errorMessage = `Не заполнены обязательные поля: ${data.missingFields.join(", ")}. Вернитесь на шаг 1 и заполните их.`;
          // Переключаем на первый шаг для заполнения
          setCurrentStep(1);
        }
        console.error("[QuestionnaireModal] Ошибка генерации:", errorMessage);
        throw new Error(errorMessage);
      }

      console.log("[QuestionnaireModal] ✅ Документы успешно сгенерированы");
      showAlert({ message: "Документы успешно сгенерированы", type: "success" });
      await loadData(); // Перезагружаем документы
    } catch (error) {
      console.error("[QuestionnaireModal] Ошибка при генерации документов:", error);
      const errorMessage = error instanceof Error ? error.message : "Ошибка при генерации документов";
      showAlert({
        message: errorMessage,
        type: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadDocument = async (documentId: string, fileName: string) => {
    console.log("[QuestionnaireModal] ===== НАЧАЛО СКАЧИВАНИЯ =====");
    console.log("[QuestionnaireModal] Document ID:", documentId);
    console.log("[QuestionnaireModal] File name:", fileName);
    
    try {
      // Добавляем ID в Set загружающихся документов
      setDownloadingDocIds((prev) => new Set(prev).add(documentId));
      // Кодируем ID для безопасной передачи в URL
      const encodedId = encodeURIComponent(documentId);
      const downloadUrl = `/api/documents/${encodedId}/download`;
      console.log("[QuestionnaireModal] Encoded ID:", encodedId);
      console.log("[QuestionnaireModal] Download URL:", downloadUrl);
      console.log("[QuestionnaireModal] Отправка запроса...");
      
      const response = await fetch(downloadUrl);
      console.log("[QuestionnaireModal] Получен ответ:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: {
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
          contentDisposition: response.headers.get("content-disposition"),
        }
      });
      
      if (!response.ok) {
        // Пытаемся получить сообщение об ошибке из JSON
        let errorMessage = "Ошибка при скачивании";
        try {
          const contentType = response.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          }
        } catch (e) {
          console.error("Не удалось прочитать ошибку:", e);
        }
        throw new Error(errorMessage);
      }

      // Проверяем, что ответ действительно содержит файл
      const contentType = response.headers.get("content-type");
      if (!contentType || (!contentType.includes("application/pdf") && 
          !contentType.includes("application/vnd.openxmlformats") && 
          !contentType.includes("application/msword") &&
          !contentType.includes("application/octet-stream"))) {
        // Если это не файл, пытаемся прочитать как JSON (ошибка)
        try {
          const errorData = await response.json();
          throw new Error(errorData.error || "Неверный тип ответа от сервера");
        } catch (e) {
          if (e instanceof Error && e.message.includes("Неверный тип")) {
            throw e;
          }
        }
      }

      const blob = await response.blob();
      
      // Проверяем, что blob не пустой
      if (blob.size === 0) {
        throw new Error("Получен пустой файл");
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || "document.pdf";
      document.body.appendChild(a);
      a.click();
      
      // Небольшая задержка перед очисткой, чтобы браузер успел начать скачивание
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 100);
    } catch (error) {
      console.error("[QuestionnaireModal] Ошибка скачивания:", error);
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при скачивании документа",
        type: "error",
      });
    } finally {
      // Удаляем ID из Set загружающихся документов
      setDownloadingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  };

  const handleUploadSigned = async (documentId: string, file: File) => {
    try {
      console.log("[QuestionnaireModal] Начало загрузки подписанного документа:", { documentId, fileName: file.name, fileSize: file.size, fileType: file.type });
      
      // Проверяем размер файла (50MB max)
      if (file.size > 50 * 1024 * 1024) {
        throw new Error("Файл слишком большой. Максимальный размер: 50MB");
      }
      
      // Проверяем тип файла
      const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("Недопустимый формат файла. Разрешены: PDF, JPG, PNG");
      }
      
      const formDataToSend = new FormData();
      formDataToSend.append("file", file);
      formDataToSend.append("documentId", documentId);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          console.log(`[QuestionnaireModal] Прогресс загрузки: ${percentComplete}%`);
          setUploadProgress((prev) => ({ ...prev, [documentId]: percentComplete }));
        }
      });

      return new Promise<void>((resolve, reject) => {
        xhr.addEventListener("load", () => {
          console.log("[QuestionnaireModal] Загрузка завершена, статус:", xhr.status);
          if (xhr.status === 200) {
            setUploadProgress((prev) => {
              const newProgress = { ...prev };
              delete newProgress[documentId];
              return newProgress;
            });
            
            // Парсим ответ для проверки статуса
            let responseData: any = {};
            try {
              responseData = JSON.parse(xhr.responseText);
            } catch (e) {
              console.warn("[QuestionnaireModal] Не удалось распарсить ответ:", e);
            }
            
            const message = responseData.allDocumentsUploaded 
              ? "Оба документа успешно загружены и отправлены на проверку!"
              : "Документ успешно загружен";
            
            showAlert({ message, type: "success" });
            loadData();
            
            // Обновляем страницу после загрузки документа, чтобы обновить баннер
            // Используем более короткую задержку и принудительное обновление
            setTimeout(() => {
              router.refresh();
              // Дополнительно обновляем через window.location если router.refresh не сработал
              setTimeout(() => {
                if (typeof window !== "undefined") {
                  window.location.reload();
                }
              }, 500);
            }, 1000);
            resolve();
          } else {
            // Пытаемся получить сообщение об ошибке из ответа
            let errorMessage = "Ошибка при загрузке";
            try {
              const response = JSON.parse(xhr.responseText);
              errorMessage = response.error || errorMessage;
            } catch (e) {
              console.error("[QuestionnaireModal] Не удалось распарсить ответ сервера:", xhr.responseText);
            }
            console.error("[QuestionnaireModal] Ошибка загрузки:", errorMessage);
            reject(new Error(errorMessage));
          }
        });

        xhr.addEventListener("error", () => {
          console.error("[QuestionnaireModal] Ошибка сети при загрузке документа");
          reject(new Error("Ошибка сети. Проверьте подключение к интернету"));
        });
        
        xhr.addEventListener("timeout", () => {
          console.error("[QuestionnaireModal] Таймаут при загрузке документа");
          reject(new Error("Превышено время ожидания. Попробуйте еще раз"));
        });
        
        xhr.timeout = 60000; // 60 секунд
        xhr.open("POST", "/api/documents/upload");
        console.log("[QuestionnaireModal] Отправка файла на сервер...");
        xhr.send(formDataToSend);
      });
    } catch (error) {
      console.error("[QuestionnaireModal] Ошибка при загрузке документа:", error);
      setUploadProgress((prev) => {
        const newProgress = { ...prev };
        delete newProgress[documentId];
        return newProgress;
      });
      showAlert({
        message: error instanceof Error ? error.message : "Ошибка при загрузке документа",
        type: "error",
      });
    }
  };

  const handleComplete = async () => {
    try {
      // Если пользователь - действующий член, сохраняем это в профиле
      if (isExistingMember) {
        await fetch("/api/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            isExistingMember: true,
            membershipStatus: "DOCUMENTS_PENDING" // Отправляем на валидацию председателю
          }),
        });
      }
      showAlert({ message: "Анкета успешно заполнена", type: "success" });
      onComplete?.();
      onClose();
    } catch (error) {
      console.error("Error completing questionnaire:", error);
      showAlert({ message: "Ошибка при сохранении", type: "error" });
    }
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
      formData.workplace &&
      formData.jobTitle
    );
  };

  const selectedOrganization = organizations.find((org) => org.id === formData.organizationId);

  if (isLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
        <div className="p-8 text-center">
          <div className="mb-4 inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-blue-500 border-r-transparent"></div>
          <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">Загрузка анкеты...</p>
          <p className="text-sm text-gray-600 dark:text-gray-400">Получение данных профиля и документов</p>
        </div>
      </Modal>
    );
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} className="w-full max-w-2xl lg:max-w-3xl">
        <div className="max-h-[calc(100vh-2rem)] sm:max-h-[85vh] overflow-y-auto p-4 sm:p-6 w-full">
          <div className="mb-4 sm:mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white pr-8 sm:pr-0">
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
          <div className="mb-4 sm:mb-6">
            <div className="mb-2 flex items-center justify-between text-xs sm:text-sm">
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
            <div className="space-y-4 sm:space-y-6">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">
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

              {/* Организация профсоюза - ПЕРВОЕ ПОЛЕ, на всю ширину */}
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Организация профсоюза <span className="text-red-500">*</span>
                </label>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  В какую организацию профсоюза вы хотите вступить?
                </p>
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

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Фамилия <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    onBlur={() => handleFieldBlur("lastName", formData.lastName)}
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
                    Отчество <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.middleName}
                    onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
                    onBlur={() => handleFieldBlur("middleName", formData.middleName)}
                    className="w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400"
                    required
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
                  <WorkplaceSearch
                    value={formData.workplace ? {
                      name: formData.workplace,
                      inn: formData.workplaceInn,
                      directorName: formData.directorName,
                      directorPosition: formData.directorPosition,
                    } : null}
                    onChange={(workplace) => {
                      if (workplace) {
                        setFormData({
                          ...formData,
                          workplace: workplace.name,
                          workplaceInn: workplace.inn,
                          directorName: workplace.directorName,
                          directorPosition: workplace.directorPosition,
                        });
                        handleFieldBlur("workplace", workplace.name);
                      } else {
                        setFormData({
                          ...formData,
                          workplace: "",
                          workplaceInn: "",
                          directorName: "",
                          directorPosition: "",
                        });
                      }
                    }}
                    required
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
                  {/* Организация профсоюза - ПЕРВОЕ ПОЛЕ */}
                  <div className="md:col-span-2">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                      Организация профсоюза:
                    </span>
                    <p className="mt-1 text-gray-900 dark:text-white">
                      {selectedOrganization?.name || ""}
                    </p>
                  </div>
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
                        Место работы:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.workplace || "Не указано"}</p>
                      {formData.directorName && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                          {formData.directorPosition}: {formData.directorName}
                        </p>
                      )}
                      {formData.workplaceInn && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                          ИНН: {formData.workplaceInn}
                        </p>
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        Должность:
                      </span>
                      <p className="mt-1 text-gray-900 dark:text-white">{formData.jobTitle}</p>
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

              {/* Опция для действующих членов профсоюза */}
              <div className={`rounded-lg border p-4 transition-all ${
                isExistingMember 
                  ? "border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20" 
                  : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800"
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isExistingMember}
                    onChange={(e) => setIsExistingMember(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      Я уже действующий член профсоюза
                    </span>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                      Выберите эту опцию, если у вас уже есть заявления на бумажном носителе, 
                      которые находятся у председателя. В этом случае загрузка документов не требуется.
                    </p>
                  </div>
                </label>
              </div>

              {isExistingMember && (
                <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900/40 dark:bg-green-900/20">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="h-5 w-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">
                        Загрузка документов пропущена
                      </p>
                      <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                        Ваша заявка будет направлена председателю для подтверждения членства. 
                        Председатель проверит наличие ваших документов и примет решение.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Показываем устав (системный документ) - всегда видно */}
              {!isExistingMember && documents
                .filter(
                  (doc) =>
                    doc.id === "charter-system" ||
                    (doc.type === "OTHER" &&
                      (doc.title?.toLowerCase().includes("устав") ||
                        doc.description?.toLowerCase().includes("устав")))
                )
                .map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900 dark:text-white sm:text-base break-words">
                          {doc.title}
                        </h4>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm break-words">
                          {doc.description || doc.fileName}
                        </p>
                      </div>
                      <div className="flex-shrink-0 sm:ml-4">
                        <button
                          onClick={() => handleDownloadDocument(doc.id, doc.fileName)}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto sm:px-4"
                        >
                          <Download className="h-4 w-4 flex-shrink-0" />
                          <span className="whitespace-nowrap">Скачать</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

              {!isExistingMember && documents.filter(
                (doc) =>
                  doc.type === "MEMBERSHIP_APPLICATION" ||
                  doc.type === "CONTRIBUTION_APPLICATION"
              ).length === 0 ? (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/40 dark:bg-blue-900/20">
                  <p className="mb-4 text-gray-700 dark:text-gray-300">
                    Нажмите кнопку ниже, чтобы сформировать документы для вступления в профсоюз.
                  </p>
                  <button
                    onClick={handleGenerateDocuments}
                    disabled={isGenerating}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isGenerating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Формирование...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Сформировать документы
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Показываем только заявления (MEMBERSHIP_APPLICATION, CONTRIBUTION_APPLICATION) */}
                  {documents
                    .filter(
                      (doc) =>
                        doc.type === "MEMBERSHIP_APPLICATION" ||
                        doc.type === "CONTRIBUTION_APPLICATION"
                    )
                    .map((doc) => (
                      <div
                        key={doc.id}
                        className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800 sm:p-4"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white sm:text-base break-words">
                              {doc.title}
                            </h4>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm break-words">
                              {doc.fileName}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:ml-4 sm:flex-row sm:flex-shrink-0">
                            <button
                              onClick={() => handleDownloadDocument(doc.id, doc.fileName)}
                              disabled={downloadingDocIds.has(doc.id)}
                              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:w-auto sm:px-4 ${
                                downloadingDocIds.has(doc.id)
                                  ? "cursor-wait bg-blue-400"
                                  : "bg-blue-600 hover:bg-blue-700"
                              }`}
                            >
                              {downloadingDocIds.has(doc.id) ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent flex-shrink-0" />
                                  <span className="whitespace-nowrap">Загрузка...</span>
                                </>
                              ) : (
                                <>
                                  <Download className="h-4 w-4 flex-shrink-0" />
                                  <span className="whitespace-nowrap">Скачать</span>
                                </>
                              )}
                            </button>
                            {(doc.status === "GENERATED" || doc.status === "SIGNED") && (
                              <label 
                                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 sm:w-auto sm:px-4 ${
                                  uploadProgress[doc.id] !== undefined
                                    ? "cursor-wait bg-purple-400"
                                    : "cursor-pointer bg-purple-600 hover:bg-purple-700"
                                }`}
                              >
                                {uploadProgress[doc.id] !== undefined ? (
                                  <>
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent flex-shrink-0" />
                                    <span className="whitespace-nowrap">Загрузка {uploadProgress[doc.id]}%</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="h-4 w-4 flex-shrink-0" />
                                    <span className="whitespace-nowrap">
                                      {doc.signedFilePath ? "Заменить заявление" : "Прикрепить заявление"}
                                    </span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept=".pdf,.jpg,.jpeg,.png"
                                  className="hidden"
                                  disabled={uploadProgress[doc.id] !== undefined}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                      handleUploadSigned(doc.id, file);
                                      // Сбрасываем input для возможности повторной загрузки того же файла
                                      e.target.value = '';
                                    }
                                  }}
                                />
                              </label>
                            )}
                            {/* Статус верификации */}
                            {doc.verificationStatus && (
                              <span 
                                className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                  doc.verificationStatus === "VERIFYING" 
                                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                                    : doc.verificationStatus === "VERIFIED"
                                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                                      : doc.verificationStatus === "FAILED"
                                        ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                        : "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                                }`}
                                title={doc.verificationMessage || undefined}
                              >
                                {doc.verificationStatus === "VERIFYING" && (
                                  <svg className="h-3 w-3 animate-spin mr-1" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                )}
                                {doc.verificationStatus === "VERIFYING" && "Проверяется..."}
                                {doc.verificationStatus === "VERIFIED" && "✓ Проверено"}
                                {doc.verificationStatus === "FAILED" && "✗ Ошибка"}
                                {doc.verificationStatus === "NEEDS_REVIEW" && "На проверке"}
                              </span>
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
                  {/* Если нет заявлений, показываем сообщение */}
                  {documents.filter(
                    (doc) =>
                      doc.type === "MEMBERSHIP_APPLICATION" ||
                      doc.type === "CONTRIBUTION_APPLICATION"
                  ).length === 0 && (
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/40 dark:bg-blue-900/20">
                      <p className="text-gray-700 dark:text-gray-300">
                        Заявления еще не сформированы. Нажмите кнопку ниже, чтобы создать их.
                      </p>
                      <button
                        onClick={handleGenerateDocuments}
                        disabled={isGenerating}
                        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                            Формирование...
                          </>
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            Сформировать заявления
                          </>
                        )}
                      </button>
                    </div>
                  )}
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
                disabled={
                  !isExistingMember && (
                    documents.filter(
                      (doc) =>
                        doc.type === "MEMBERSHIP_APPLICATION" ||
                        doc.type === "CONTRIBUTION_APPLICATION"
                    ).length === 0 ||
                    documents
                      .filter(
                        (doc) =>
                          doc.type === "MEMBERSHIP_APPLICATION" ||
                          doc.type === "CONTRIBUTION_APPLICATION"
                      )
                      .some((doc) => doc.status === "GENERATED")
                  )
                }
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isExistingMember ? "Подтвердить" : "Далее"}
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
