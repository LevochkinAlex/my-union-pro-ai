"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

export type MembershipAccessStatus = 
  | "loading"
  | "approved"      // Полный доступ
  | "pending"       // Ожидает проверки/одобрения
  | "incomplete"    // Профиль не заполнен
  | "rejected"      // Отклонён
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
  }>({ membershipStatus: null, unionMembershipStatus: null, role: null });
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
          });
        }
      } catch (error) {
        console.error("[useMembershipAccess] Error fetching membership status:", error);
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

    const { membershipStatus, unionMembershipStatus, role } = membershipData;

    // Роли с полным доступом (председатели и админы)
    const privilegedRoles = ["PPO_HEAD", "REGIONAL_CHAIRMAN", "FEDERAL_CHAIRMAN", "SUPER_ADMIN"];
    if (role && privilegedRoles.includes(role)) {
      return "approved";
    }

    // Проверяем статусы членства
    // ВАЖНО: Заглушки должны видеть только невалидированные пользователи
    // Валидированные пользователи (с любым статусом кроме PENDING_VERIFICATION и PROFILE_INCOMPLETE) имеют доступ
    
    // Полный доступ имеют:
    // 1. Одобренные члены (APPROVED)
    // 2. Пользователи с документами на проверке (DOCUMENTS_PENDING) - уже валидированы председателем
    // 3. Пользователи с принятым членством в профсоюзе (ACCEPTED)
    if (
      membershipStatus === "APPROVED" || 
      membershipStatus === "DOCUMENTS_PENDING" || // Документы отправлены - уже валидирован
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

    // PENDING_VERIFICATION - еще не валидирован, должен видеть заглушку
    // Все остальные статусы (SUSPENDED, EXCLUDED) - тоже не имеют доступа
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

