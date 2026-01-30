"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import TourGuideModal from "./TourGuideModal";
import {
  getTourDismissed,
  getTourShownAfterApproval,
  setTourShownAfterApproval,
  TOUR_STORAGE_KEY,
} from "@/lib/tour-guide-steps";
import { DEMO_USER_ID, DEMO_MEMBER_USER_ID } from "@/lib/demo-constants";

const SESSION_SHOWN_KEY = "tour_guide_session_shown";
const SESSION_SHOWN_KEY_DEMO = "tour_guide_session_shown_demo";

type TourContextValue = {
  openTour: () => void;
  isOpen: boolean;
};

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) {
    return {
      openTour: () => {},
      isOpen: false,
    };
  }
  return ctx;
}

interface TourGuideProviderProps {
  children: React.ReactNode;
  /** Показать тур автоматически один раз за сессию при первом заходе (если не отключён «больше не показывать») */
  autoShowOncePerSession?: boolean;
}

export default function TourGuideProvider({
  children,
  autoShowOncePerSession = true,
}: TourGuideProviderProps) {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  const isDemo =
    !!session?.user?.id &&
    (session.user.id === DEMO_USER_ID ||
      session.user.id === DEMO_MEMBER_USER_ID ||
      (session.user as { isDemo?: boolean })?.isDemo);

  const openTour = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeTour = useCallback(() => {
    setIsOpen(false);
  }, []);

  const membershipStatus = (session?.user as { membershipStatus?: string } | undefined)?.membershipStatus;

  useEffect(() => {
    if (!autoShowOncePerSession) return;
    if (getTourDismissed(isDemo)) return;
    try {
      if (typeof window === "undefined") return;
      const sessionKey = isDemo ? SESSION_SHOWN_KEY_DEMO : SESSION_SHOWN_KEY;
      if (sessionStorage.getItem(sessionKey) === "true") return;
      sessionStorage.setItem(sessionKey, "true");
      setIsOpen(true);
    } catch {
      // ignore
    }
  }, [autoShowOncePerSession, isDemo]);

  // После принятия в члены профсоюза (APPROVED) показываем тур один раз
  useEffect(() => {
    if (membershipStatus !== "APPROVED") return;
    if (getTourDismissed(isDemo)) return;
    if (getTourShownAfterApproval(isDemo)) return;
    try {
      setTourShownAfterApproval(isDemo);
      setIsOpen(true);
    } catch {
      // ignore
    }
  }, [membershipStatus, isDemo]);

  const value: TourContextValue = {
    openTour,
    isOpen,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourGuideModal isOpen={isOpen} onClose={closeTour} isDemo={isDemo} />
    </TourContext.Provider>
  );
}

export { TOUR_STORAGE_KEY };
