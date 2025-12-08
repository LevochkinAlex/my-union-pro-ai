"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import QuestionnaireModal from "@/components/profile/QuestionnaireModal";
import { calculateProfileProgress } from "@/lib/profile-progress";

interface MembershipBannerProps {
  profileProgress: number; // 0-100
  hasDocuments: boolean;
  membershipStatus: string;
  hasAdditionalInfo?: boolean; // Заполнена ли дополнительная информация
  hasAwards?: boolean; // Заполнены ли награды
}

export default function MembershipBanner({
  profileProgress: initialProfileProgress,
  hasDocuments: initialHasDocuments,
  membershipStatus: initialMembershipStatus,
  hasAdditionalInfo: initialHasAdditionalInfo = false,
  hasAwards: initialHasAwards = false,
}: MembershipBannerProps) {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const [isVisible, setIsVisible] = useState(true);
  const [isQuestionnaireOpen, setIsQuestionnaireOpen] = useState(false);
  
  // Локальное состояние для обновления данных
  const [profileProgress, setProfileProgress] = useState(initialProfileProgress);
  const [hasDocuments, setHasDocuments] = useState(initialHasDocuments);
  const [membershipStatus, setMembershipStatus] = useState(initialMembershipStatus);
  const [hasAdditionalInfo, setHasAdditionalInfo] = useState(initialHasAdditionalInfo);
  const [hasAwards, setHasAwards] = useState(initialHasAwards);

  // Обновляем данные при изменении пропсов
  useEffect(() => {
    setProfileProgress(initialProfileProgress);
    setHasDocuments(initialHasDocuments);
    setMembershipStatus(initialMembershipStatus);
    setHasAdditionalInfo(initialHasAdditionalInfo);
    setHasAwards(initialHasAwards);
  }, [initialProfileProgress, initialHasDocuments, initialMembershipStatus, initialHasAdditionalInfo, initialHasAwards]);

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
        const documents = docsData.documents || [];
        
        // Проверяем наличие отправленных документов
        const sentDocuments = documents.filter((doc: any) => {
          const isCorrectType = doc.type === "MEMBERSHIP_APPLICATION" || doc.type === "CONTRIBUTION_APPLICATION";
          if (!isCorrectType) return false;
          
          if (doc.status === "PENDING" || doc.status === "APPROVED") {
            return true;
          }
          
          if (doc.status === "SIGNED" && doc.signedFilePath) {
            return true;
          }
          
          return false;
        });
        
        const newHasDocuments = sentDocuments.length > 0;
        const newMembershipStatus = user?.membershipStatus || membershipStatus;
        const newProfileProgress = user ? calculateProfileProgress(user).total : profileProgress;
        
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
  }, [membershipStatus]); // Упрощены зависимости для предотвращения лишних перезапусков

  // Если пользователь APPROVED и заполнил все доп. информацию и награды - скрываем баннер
  if (membershipStatus === "APPROVED" && hasAdditionalInfo && hasAwards) {
    return null;
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
          buttonAction: () => router.push("/dashboard/profile?tab=additional"),
        };
      }
      return null;
    };

    const approvedStatusInfo = getApprovedStatusInfo();
    if (!approvedStatusInfo) {
      return null; // Все заполнено
    }

    return (
      <div className="relative overflow-hidden rounded-xl border border-green-200 bg-gradient-to-br from-green-50 via-green-50/50 to-blue-50 p-6 shadow-lg dark:border-green-900/50 dark:from-green-900/20 dark:via-green-900/10 dark:to-blue-900/20">
        <div className="absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-green-200/30 blur-3xl dark:bg-green-500/20" />
        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-32 w-32 rounded-full bg-blue-200/30 blur-2xl dark:bg-blue-500/20" />

        <div className="relative">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex-1">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-white dark:bg-green-500">
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
    );
  }

  // Определяем текст и статус
  const getStatusInfo = () => {
    if (profileProgress < 100) {
      return {
        title: "Заполните анкету, чтобы стать членом профсоюза",
        description: "Заполните все обязательные поля профиля для подачи заявления",
        buttonText: "Заполнить анкету",
        buttonAction: () => setIsQuestionnaireOpen(true),
      };
    } else if (!hasDocuments) {
      return {
        title: "Сгенерируйте документы для вступления",
        description: "Ваш профиль заполнен. Теперь нужно сгенерировать и отправить документы",
        buttonText: "Перейти к документам",
        buttonAction: () => router.push("/dashboard/documents"),
      };
    } else {
      return {
        title: "Ожидайте проверки документов",
        description: "Ваши документы отправлены на проверку. После одобрения вы станете полноправным членом профсоюза",
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
    <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 via-blue-50/50 to-purple-50 p-6 shadow-lg dark:border-blue-900/50 dark:from-blue-900/20 dark:via-blue-900/10 dark:to-purple-900/20">
      {/* Декоративные элементы */}
      <div className="absolute right-0 top-0 -mr-20 -mt-20 h-40 w-40 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-500/20" />
      <div className="absolute bottom-0 left-0 -mb-10 -ml-10 h-32 w-32 rounded-full bg-purple-200/30 blur-2xl dark:bg-purple-500/20" />

      <div className="relative">
        {/* Заголовок и кнопка закрытия */}
        <div className="mb-4 flex items-start justify-between">
          <div className="flex-1">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white dark:bg-blue-500">
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
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-purple-600 transition-all duration-500 ease-out"
              style={{ width: `${profileProgress}%` }}
            >
              <div className="h-full w-full animate-pulse bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          </div>
        </div>

        {/* Список шагов */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div
            className={`flex items-center gap-2 rounded-lg p-2 ${
              profileProgress >= 33
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {profileProgress >= 33 ? (
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
              hasDocuments
                ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                : profileProgress >= 100
                ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"
                : "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {hasDocuments ? (
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
        onClose={() => setIsQuestionnaireOpen(false)}
        onComplete={() => {
          // Обновляем страницу после завершения анкеты
          window.location.reload();
        }}
      />
    </div>
  );
}

