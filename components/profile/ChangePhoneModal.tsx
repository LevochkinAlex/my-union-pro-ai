"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import { useSession } from "next-auth/react";

interface ChangePhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPhone: string;
  onPhoneChanged: (newPhone: string) => void;
}

const TELEGRAM_BOT_USERNAME = "myunionpro_bot";
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_TIME_MS = 5 * 60 * 1000; // 5 minutes

export default function ChangePhoneModal({
  isOpen,
  onClose,
  currentPhone,
  onPhoneChanged,
}: ChangePhoneModalProps) {
  const { data: session } = useSession();
  const [step, setStep] = useState<"prompt" | "waiting">("prompt");
  const [error, setError] = useState("");
  const [deepLink, setDeepLink] = useState("");

  useEffect(() => {
    if (isOpen && session?.user?.id) {
      setStep("prompt");
      setError("");
      setDeepLink(
        `https://t.me/${TELEGRAM_BOT_USERNAME}?start=change_phone_${session.user.id}`
      );
    }
  }, [isOpen, session?.user?.id]);

  const pollForPhoneChange = useCallback(async () => {
    if (!session?.user?.id) return;
    const startedAt = Date.now();

    const poll = async () => {
      if (Date.now() - startedAt > MAX_POLL_TIME_MS) {
        setError("Время ожидания истекло. Попробуйте снова.");
        setStep("prompt");
        return;
      }

      try {
        const res = await fetch("/api/profile");
        if (res.ok) {
          const data = await res.json();
          const newPhone = data.phone || data.user?.phone;
          if (newPhone && newPhone !== currentPhone) {
            onPhoneChanged(newPhone);
            onClose();
            return;
          }
        }
      } catch {
        // network error, keep polling
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
  }, [session?.user?.id, currentPhone, onPhoneChanged, onClose]);

  const handleOpenTelegram = () => {
    setStep("waiting");
    window.open(deepLink, "_blank");
    pollForPhoneChange();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md">
      <ModalHeader>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Изменить номер телефона
        </h2>
      </ModalHeader>
      <ModalBody>
        <div className="space-y-4">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              Текущий номер: <strong>{currentPhone || "не указан"}</strong>
            </p>
          </div>

          {step === "prompt" && (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Для смены номера телефона откройте Telegram и поделитесь новым номером через бот.
              </p>

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="button"
                onClick={handleOpenTelegram}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-[#0088cc] hover:bg-[#0077b5] text-white font-medium rounded-xl transition-colors"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635.099-.002.321.023.465.141.121.1.154.234.17.331.015.098.034.321.019.496z"/>
                </svg>
                Открыть Telegram
              </button>
            </>
          )}

          {step === "waiting" && (
            <>
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-3">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-r-transparent" />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Ожидаем подтверждение номера в Telegram...
                </p>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                  Нажмите кнопку &laquo;Поделиться номером&raquo; в боте
                </p>
              </div>

              <a
                href={deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 underline"
              >
                Открыть Telegram снова
              </a>
            </>
          )}
        </div>
      </ModalBody>
      <ModalFooter className="flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        >
          {step === "waiting" ? "Закрыть" : "Отмена"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
