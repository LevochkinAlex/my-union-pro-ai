"use client";

import { useEffect } from "react";
import { dispatchPartnerApplicationsNewRefresh } from "@/components/dashboard/PartnerApplicationsNewBadge";

/** После открытия карточки заявки (сервер мог перевести NEW → IN_PROGRESS) обновляем счётчик «Новых» в меню. */
export default function PartnerApplicationOpenedBeacon() {
  useEffect(() => {
    dispatchPartnerApplicationsNewRefresh();
  }, []);
  return null;
}
