"use client";

import { MembershipGate } from "@/components/MembershipGate";
import DiscountsClient from "@/components/dashboard/discounts/DiscountsClient";
import type {
  DiscountItem,
  DiscountPreferenceResponse,
  DiscountSearchResult,
} from "@/types/discounts";

interface DiscountsPageWrapperProps {
  initialData: DiscountSearchResult;
  initialPreference: DiscountPreferenceResponse;
  /** Название города из профиля — показываем в фильтре, если выбран город */
  preferredCityName?: string | null;
  /** Площадки партнёров с SSR — без пустой сетки до клиентского fetch */
  initialPartnerVenues?: DiscountItem[];
}

export default function DiscountsPageWrapper({
  initialData,
  initialPreference,
  preferredCityName,
  initialPartnerVenues,
}: DiscountsPageWrapperProps) {
  return (
    <MembershipGate 
      showBlur={true}
      title="Скидки для членов профсоюза"
      description="Получите доступ к эксклюзивным скидкам и предложениям от партнёров. Заполните анкету и станьте членом профсоюза."
    >
      <DiscountsClient
        initialData={initialData}
        initialPreference={initialPreference}
        preferredCityName={preferredCityName ?? undefined}
        initialPartnerVenues={initialPartnerVenues}
      />
    </MembershipGate>
  );
}

