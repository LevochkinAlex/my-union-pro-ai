"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export type MembershipAccessStatus = 
  | "loading"
  | "approved"      // Полный доступ
  | "pending"       // Ожидает проверки/одобрения
  | "incomplete"    // Профиль не заполнен
  | "rejected"      // Отклонён
  | "excluded"      // Исключён из профсоюза
  | "subscription_blocked" // Доступ закрыт по лимиту подписки организации
  | "unauthenticated";

interface MembershipAccessResult {
  status: MembershipAccessStatus;
  isApproved: boolean;
  isLoading: boolean;
  membershipStatus: string | null;
  unionMembershipStatus: string | null;
  message: string;
}

/**
 * Хук для проверки доступа пользователя на основе статуса членства
 * 
 * Полный доступ имеют пользователи с:
 * - membershipStatus === 'APPROVED'
 * - ИЛИ unionMembershipStatus === 'ACCEPTED'
 * - ИЛИ роль PPO_HEAD, REGIONAL_CHAIRMAN, FEDERAL_CHAIRMAN, SUPER_ADMIN
 */
export function useMembershipAccess(): MembershipAccessResult {
  const { data: session, status: sessionStatus } = useSession();
  const [membershipData, setMembershipData] = useState<{
    membershipStatus: string | null;
    unionMembershipStatus: string | null;
    role: string | null;
    subscriptionBlockedAt: string | null;
  }>({ membershipStatus: null, unionMembershipStatus: null, role: null, subscriptionBlockedAt: null });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMembershipStatus = async () => {
      if (sessionStatus === "loading") return;
      
      if (sessionStatus === "unauthenticated" || !session?.user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/profile");
        if (response.ok) {
          const data = await response.json();
          setMembershipData({
            membershipStatus: data.user?.membershipStatus || null,
            unionMembershipStatus: data.user?.unionMembershipStatus || null,
            role: data.user?.role || null,
            subscriptionBlockedAt: data.user?.subscriptionBlockedAt ?? null,
          });
        } else {
          // Fallback: при 404/503 используем данные сессии, чтобы проверенные члены и председатели видели контент
          setMembershipData({
            membershipStatus: session?.user?.membershipStatus ?? null,
            unionMembershipStatus: null,
            role: session?.user?.role ?? null,
            subscriptionBlockedAt: (session?.user as { subscriptionBlockedAt?: string })?.subscriptionBlockedAt ?? null,
          });
        }
      } catch (error) {
        console.error("[useMembershipAccess] Error fetching membership status:", error);
        // Fallback на сессию при сетевой ошибке или недоступности API
        setMembershipData({
          membershipStatus: session?.user?.membershipStatus ?? null,
          unionMembershipStatus: null,
          role: session?.user?.role ?? null,
          subscriptionBlockedAt: (session?.user as { subscriptionBlockedAt?: string })?.subscriptionBlockedAt ?? null,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMembershipStatus();
  }, [session?.user?.id, sessionStatus]);

  // Определяем статус доступа
  const getAccessStatus = (): MembershipAccessStatus => {
    if (sessionStatus === "loading" || isLoading) return "loading";
    if (sessionStatus === "unauthenticated") return "unauthenticated";

    const { membershipStatus, unionMembershipStatus, role, subscriptionBlockedAt } = membershipData;

    // Роли с полным доступом (председатели и админы) — не блокируются по подписке
    const privilegedRoles = ["PPO_HEAD", "REGIONAL_CHAIRMAN", "FEDERAL_CHAIRMAN", "SUPER_ADMIN"];
    if (role && privilegedRoles.includes(role)) {
      return "approved";
    }

    // Блокировка по лимиту подписки организации (последние зарегистрированные сверх лимита)
    if (subscriptionBlockedAt) {
      return "subscription_blocked";
    }

    // Исключённый снова подал документы или сменил организацию — показываем как «ожидает одобрения», как при первой регистрации
    const reApplyingAfterExclusion =
      unionMembershipStatus === "REMOVED" &&
      (membershipStatus === "DOCUMENTS_PENDING" || membershipStatus === "PROFILE_INCOMPLETE");
    if (reApplyingAfterExclusion) {
      return "pending";
    }

    // Исключённые из профсоюза — блокируем до проверки ACCEPTED
    if (membershipStatus === "EXCLUDED" || unionMembershipStatus === "REMOVED") {
      return "excluded";
    }

    // Полный доступ имеют только одобренные члены и привилегированные роли.
    if (
      membershipStatus === "APPROVED" ||
      unionMembershipStatus === "ACCEPTED"
    ) {
      return "approved";
    }

    if (membershipStatus === "REJECTED") {
      return "rejected";
    }

    if (membershipStatus === "PROFILE_INCOMPLETE") {
      return "incomplete";
    }

    // PENDING_VERIFICATION - ещё не проверен, должен видеть заглушку
    // Все остальные статусы (SUSPENDED) - тоже не имеют доступа
    return "pending";
  };

  const status = getAccessStatus();
  
  const getMessage = (): string => {
    switch (status) {
      case "approved":
        return "Добро пожаловать! У вас полный доступ.";
      case "pending":
        return "Ваша заявка на вступление в профсоюз находится на рассмотрении. Дождитесь одобрения председателя.";
      case "incomplete":
        return "Заполните анкету и подайте заявку на вступление в профсоюз.";
      case "rejected":
        return "Ваша заявка была отклонена. Свяжитесь с председателем для уточнения причин.";
      case "excluded":
        return "Вы были исключены из профсоюза. Свяжитесь с председателем для уточнения причин.";
      case "subscription_blocked":
        return "Доступ приостановлен по лимиту подписки организации. Свяжитесь с председателем для уточнения.";
      case "unauthenticated":
        return "Войдите в систему для доступа к этой странице.";
      default:
        return "Загрузка...";
    }
  };

  return {
    status,
    isApproved: status === "approved",
    isLoading: status === "loading",
    membershipStatus: membershipData.membershipStatus,
    unionMembershipStatus: membershipData.unionMembershipStatus,
    message: getMessage(),
  };
}

