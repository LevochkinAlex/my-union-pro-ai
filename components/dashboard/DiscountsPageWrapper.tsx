"use client";

import { MembershipGate } from "@/components/MembershipGate";
import DiscountsClient from "@/components/dashboard/discounts/DiscountsClient";
import type { DiscountPreferenceResponse, DiscountSearchResult } from "@/types/discounts";

interface DiscountsPageWrapperProps {
  initialData: DiscountSearchResult;
  initialPreference: DiscountPreferenceResponse;
}

export default function DiscountsPageWrapper({
  initialData,
  initialPreference,
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
      />
    </MembershipGate>
  );
}

