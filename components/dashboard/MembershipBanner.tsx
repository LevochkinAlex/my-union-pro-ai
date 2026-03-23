"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import QuestionnaireModal from "@/components/profile/QuestionnaireModal";
import AdditionalInfoModal from "@/components/profile/AdditionalInfoModal";
import { ProgressBarFill } from "@/components/ui/ProgressBarFill";
import { calculateProfileProgress } from "@/lib/profile-progress";
import { hasBothApplicationsSubmitted } from "@/lib/documents-status";

interface MembershipBannerProps {
  profileProgress: number; // 0-100
  profileReadyForApplication?: boolean; // Готов ли профиль к подаче заявления
  hasDocuments: boolean;
  membershipStatus: string;
  hasAdditionalInfo?: boolean; // Заполнена ли дополнительная информация
  hasAwards?: boolean; // Заполнены ли награды
}

export default function MembershipBanner({
  profileProgress: initialProfileProgress,
  profileReadyForApplication: initialProfileReadyForApplication = false,
  hasDocuments: initialHasDocuments,
  membershipStatus: initialMembershipStatus,
  hasAdditionalInfo: initialHasAdditionalInfo = false,
  hasAwards: initialHasAwards = false,
}: MembershipBannerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, update: updateSession } = useSession();
  const [isVisible, setIsVisible] = useState(true);
  const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(false);
  const [isAdditionalInfoModalOpen, setIsAdditionalInfoModalOpen] = useState(false);

  const QUESTIONNAIRE_MODAL_KEY = "questionnaireModalOpen";

  // Восстановить открытую модалку после Fast Refresh / перемонтирования (например после загрузки заявления)
  useEffect(() => {
    if (typeof window !== "undefined" && window.sessionStorage?.getItem(QUESTIONNAIRE_MODAL_KEY) === "1") {
      setIsQuestionnaireOpen(true);
    }
  }, []);

  // Автоматически открыть модалку анкеты если есть параметр в URL
  useEffect(() => {
    if (searchParams.get("openQuestionnaire") === "true") {
      setIsQuestionnaireOpen(true);
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(QUESTIONNAIRE_MODAL_KEY, "1");
      }
      router.replace("/dashboard", { scroll: false });
    }
  }, [searchParams, router]);
  
  // Локальное состояние для обновления данных
  const [profileProgress, setProfileProgress] = useState(initialProfileProgress);
  const [profileReadyForApplication, setProfileReadyForApplication] = useState(initialProfileReadyForApplication);
  const [hasDocuments, setHasDocuments] = useState(initialHasDocuments);
  const [membershipStatus, setMembershipStatus] = useState(initialMembershipStatus);
  const [hasAdditionalInfo, setHasAdditionalInfo] = useState(initialHasAdditionalInfo);
  const [hasAwards, setHasAwards] = useState(initialHasAwards);

  // Обновляем данные при изменении пропсов
  useEffect(() => {
    setProfileProgress(initialProfileProgress);
    setProfileReadyForApplication(initialProfileReadyForApplication);
    setHasDocuments(initialHasDocuments);
    setMembershipStatus(initialMembershipStatus);
    setHasAdditionalInfo(initialHasAdditionalInfo);
    setHasAwards(initialHasAwards);
  }, [initialProfileProgress, initialProfileReadyForApplication, initialHasDocuments, initialMembershipStatus, initialHasAdditionalInfo, initialHasAwards]);

  // Периодически обновляем данные (каждые 30 секунд, если документы еще не отправлены)
  // ИСПРАВЛЕНО: Увеличен интервал и убран router.refresh() для предотвращения бесконечного цикла
  useEffect(() => {
    if (membershipStatus === "APPROVED") return; // Не обновляем для APPROVED
    
    let mounted = true;
    let isChecking = false; // Защита от race condition
    
    const checkStatus = async () => {
      if (!mounted || isChecking) return;
      isChecking = true;
      
      try {
        // Загружаем актуальные данные профиля
        const response = await fetch("/api/profile");
        if (!response.ok || !mounted) {
          isChecking = false;
          return;
        }
        
        const data = await response.json();
        const user = data.user;
        
        // Проверяем документы
        const docsResponse = await fetch("/api/documents");
        if (!docsResponse.ok || !mounted) {
          isChecking = false;
          return;
        }
        
        const docsData = await docsResponse.json();
        const documents = docsData.outgoingDocuments || docsData.documents || [];
        const newHasDocuments = hasBothApplicationsSubmitted(documents);
        const newMembershipStatus = user?.membershipStatus || membershipStatus;
        const progressResult = user ? calculateProfileProgress(user) : null;
        const newProfileProgress = progressResult?.total ?? profileProgress;
        const newProfileReadyForApplication = progressResult?.isReadyForApplication ?? profileReadyForApplication;
        
        // Проверяем заполнение дополнительной информации
        const newHasAdditionalInfo = !!(
          user?.additionalInfo || 
          user?.aboutMe || 
          user?.hobbies
        );
        
        // Проверяем наличие наград
        let newHasAwards = false;
        if (user?.awards) {
          try {
            const parsedAwards = JSON.parse(user.awards);
            newHasAwards = Array.isArray(parsedAwards) && parsedAwards.length > 0;
          } catch {
            newHasAwards = false;
          }
        }
        
        if (!mounted) {
          isChecking = false;
          return;
        }
        
        // Обновляем состояние БЕЗ router.refresh()
        if (newHasDocuments !== hasDocuments) {
          setHasDocuments(newHasDocuments);
        }
        
        if (newMembershipStatus !== membershipStatus) {
          setMembershipStatus(newMembershipStatus);
        }
        
        if (newProfileProgress !== profileProgress) {
          setProfileProgress(newProfileProgress);
        }

        if (newProfileReadyForApplication !== profileReadyForApplication) {
          setProfileReadyForApplication(newProfileReadyForApplication);
        }
        
        if (newHasAdditionalInfo !== hasAdditionalInfo) {
          setHasAdditionalInfo(newHasAdditionalInfo);
        }
        
        if (newHasAwards !== hasAwards) {
          setHasAwards(newHasAwards);
        }
      } catch (error) {
        console.error("[MembershipBanner] Ошибка обновления данных:", error);
      } finally {
        isChecking = false;
      }
    };
    
    // Проверяем сразу при монтировании
    checkStatus();
    
    // Затем проверяем каждые 30 секунд (было 3 секунды - слишком часто!)
    const interval = setInterval(checkStatus, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [membershipStatus, profileReadyForApplication, profileProgress, hasDocuments, hasAdditionalInfo, hasAwards]); // Держим зависимости актуальными для корректных обновлений

  // Если пользователь APPROVED и заполнил все доп. информацию и награды - скрываем баннер
  if (membershipStatus === "APPROVED" && hasAdditionalInfo && hasAwards) {
    return null;
  }

  // Исключённый: баннер с ограниченным доступом
  if (membershipStatus === "EXCLUDED") {
    if (!isVisible) return null;
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-amber-900 dark:text-amber-100">
              Вы исключены из профсоюза
            </h3>
            <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
              Доступ ограничен. Вам доступны: Мои скидки (активные и использованные), Чат (чтение переписки, без отправки сообщений в прежнюю организацию), Профиль. Для восстановления членства обновите организацию в профиле и подайте документы заново.
            </p>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="rounded-lg p-1 text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-800/50"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // Если пользователь APPROVED - показываем баннер для доп. информации
  if (membershipStatus === "APPROVED") {
    const getApprovedStatusInfo = () => {
      if (!hasAdditionalInfo || !hasAwards) {
        return {
          title: "Заполните дополнительную информацию",
          description: hasAdditionalInfo 
            ? "Добавьте информацию о ваших наградах и достижениях"
            : hasAwards
            ? "Заполните дополнительную информацию о себе"
            : "Заполните дополнительную информацию и добавьте награды",
          buttonText: "Заполнить профиль",
          buttonAction: () => setIsAdditionalInfoModalOpen(true),
        };
      }
      return null;
    };

    const approvedStatusInfo = getApprovedStatusInfo();
    if (!approvedStatusInfo) {
      return null; // Все заполнено
    }
    if (!isVisible) {
      return null; // Пользователь закрыл плашку
    }

    return (
      <>
      <div className="relative overflow-hidden rounded-xl border border-green-200 bg-gradient-to-br from-green-50 via-green-50/50 to-blue-50 p-6 shadow-lg dark:border-green-900/50 dark:from-green-900/20 dark:via-green-900/10 dark:to-blue-900/20">
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-green-200/30 blur-3xl dark:bg-green-500/20" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-32 w-32 rounded-full bg-blue-200/30 blur-2xl dark:bg-blue-500/20" />

        <div className="relative">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex aspect-square h-10 w-10 min-h-10 min-w-10 max-h-10 max-w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white dark:bg-green-500 p-[7px]">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {approvedStatusInfo.title}
                </h3>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {approvedStatusInfo.description}
              </p>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="ml-4 rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
              aria-label="Закрыть"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className={`flex items-center gap-2 rounded-lg p-2 ${
              hasAdditionalInfo
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              {hasAdditionalInfo ? (
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-current" />
              )}
              <span className="text-xs font-medium">Дополнительная информация</span>
            </div>
            <div className={`flex items-center gap-2 rounded-lg p-2 ${
              hasAwards
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}>
              {hasAwards ? (
                <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              ) : (
                <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-current" />
              )}
              <span className="text-xs font-medium">Награды</span>
            </div>
          </div>

          <button
            onClick={approvedStatusInfo.buttonAction}
            className="w-full rounded-lg bg-green-600 px-6 py-3 font-semibold text-white shadow-md transition-all hover:bg-green-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:bg-green-500 dark:hover:bg-green-600"
          >
            {approvedStatusInfo.buttonText}
          </button>
        </div>
      </div>

      <AdditionalInfoModal
        isOpen={isAdditionalInfoModalOpen}
        onClose={() => setIsAdditionalInfoModalOpen(false)}
        onComplete={() => {
          setIsAdditionalInfoModalOpen(false);
          window.location.reload();
        }}
      />
    </>
    );
  }

  // Определяем текст и статус
  const getStatusInfo = () => {
    const isDocumentsInReview = membershipStatus === "DOCUMENTS_PENDING";
    const hasSubmittedFlow =
      hasDocuments &&
      (isDocumentsInReview || membershipStatus === "PENDING_VERIFICATION" || membershipStatus === "PENDING");
    const canStartOrRestartApplication =
      profileReadyForApplication &&
      (membershipStatus === "PROFILE_INCOMPLETE" ||
        membershipStatus === "REJECTED" ||
        membershipStatus === "EXCLUDED" ||
        !hasDocuments);

    // Важен приоритет стадии: если заявления уже отправлены, не откатываем пользователя
    // обратно к шагу "Заполнить анкету" из-за процентов профиля.
    if (hasSubmittedFlow) {
      return {
        title: "Вас должны одобрить — ожидайте",
        description: "Ваши документы отправлены на проверку. Председатель должен одобрить заявку — ожидайте, как при первой подаче. После одобрения вы станете полноправным членом профсоюза.",
        buttonText: "Просмотреть документы",
        buttonAction: () => router.push("/dashboard/documents"),
      };
    }

    if (!profileReadyForApplication) {
      return {
        title: "Заполните анкету, чтобы стать членом профсоюза",
        description: "Заполните все обязательные поля профиля для подачи заявления",
        buttonText: "Заполнить анкету",
        buttonAction: () => {
          if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.setItem(QUESTIONNAIRE_MODAL_KEY, "1");
          }
          setIsQuestionnaireOpen(true);
        },
      };
    }

    if (canStartOrRestartApplication) {
      return {
        title: "Профиль заполнен — можно подать заявление",
        description: "Откройте анкету и отправьте заявления на вступление в профсоюз",
        buttonText: "Подать заявление о вступлении",
        buttonAction: () => {
          if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.setItem(QUESTIONNAIRE_MODAL_KEY, "1");
          }
          setIsQuestionnaireOpen(true);
        },
      };
    } else {
      return {
        title: "Вас должны одобрить — ожидайте",
        description: "Ваши документы отправлены на проверку. Председатель должен одобрить заявку — ожидайте, как при первой подаче. После одобрения вы станете полноправным членом профсоюза.",
        buttonText: "Просмотреть документы",
        buttonAction: () => router.push("/dashboard/documents"),
      };
    }
  };

  const statusInfo = getStatusInfo();

  if (!isVisible) {
    return null;
  }

  return (
    <div data-tour="membership-banner" className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-blue-50/50 to-purple-50 p-6 shadow-lg dark:border-blue-900/50 dark:from-blue-900/20 dark:via-blue-900/10 dark:to-purple-900/20">
      {/* Декоративные элементы */}
      <div className="absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/20" />
      <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-32 w-32 rounded-full bg-purple-200/30 blur-2xl dark:bg-purple-500/20" />

      <div className="relative">
        {/* Заголовок и кнопка закрытия */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex aspect-square h-10 w-10 min-h-10 min-w-10 max-h-10 max-w-10 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white dark:bg-blue-500 p-[7px]">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                {statusInfo.title}
              </h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {statusInfo.description}
            </p>
          </div>
          <button
            onClick={() => setIsVisible(false)}
            className="ml-4 rounded-lg p-1 text-gray-400 transition hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Прогресс-бар */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Прогресс заполнения профиля
            </span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">
              {profileProgress}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <ProgressBarFill
              value={profileProgress}
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600 transition-all duration-500 ease-out progress-bar-fill"
            />
          </div>
        </div>

        {/* Список шагов */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div
            className={`flex items-center gap-2 rounded-lg p-2 ${
              profileReadyForApplication || hasDocuments || membershipStatus === "APPROVED"
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {profileReadyForApplication || hasDocuments || membershipStatus === "APPROVED" ? (
              <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-current" />
            )}
            <span className="text-xs font-medium">Заполнить профиль</span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg p-2 ${
              hasDocuments || membershipStatus === "DOCUMENTS_PENDING"
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : profileReadyForApplication
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {hasDocuments || membershipStatus === "DOCUMENTS_PENDING" ? (
              <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-current" />
            )}
            <span className="text-xs font-medium">Отправить документы</span>
          </div>
          <div
            className={`flex items-center gap-2 rounded-lg p-2 ${
              membershipStatus === "APPROVED"
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {membershipStatus === "APPROVED" ? (
              <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-current" />
            )}
            <span className="text-xs font-medium">Стать членом профсоюза</span>
          </div>
        </div>

        {/* Кнопка действия */}
        <button
          onClick={statusInfo.buttonAction}
          className="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white shadow-md transition-all hover:bg-blue-700 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-blue-500 dark:hover:bg-blue-600"
        >
          {statusInfo.buttonText}
        </button>
      </div>

      {/* Модальное окно анкеты */}
      <QuestionnaireModal
        isOpen={isQuestionnaireOpen}
        onClose={() => {
          if (typeof window !== "undefined" && window.sessionStorage) {
            window.sessionStorage.removeItem(QUESTIONNAIRE_MODAL_KEY);
          }
          setIsQuestionnaireOpen(false);
          router.refresh();
        }}
        onComplete={() => {
          window.location.reload();
        }}
      />

      {/* Модальное окно: доп. информация и награды (для APPROVED) */}
      <AdditionalInfoModal
        isOpen={isAdditionalInfoModalOpen}
        onClose={() => setIsAdditionalInfoModalOpen(false)}
        onComplete={() => {
          setIsAdditionalInfoModalOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}

