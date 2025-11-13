"use client";

import { useEffect, useRef } from "react";

interface PhoneInputProps {
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function PhoneInput({
  name,
  value,
  onChange,
  placeholder = "+7 (___) ___-__-__",
  className = "",
  disabled = false,
}: PhoneInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Форматирование номера телефона
  const formatPhoneNumber = (input: string): string => {
    // Удаляем все нецифровые символы
    let cleaned = input.replace(/\D/g, "");

    // Если начинается с 8, заменяем на 7
    if (cleaned.startsWith("8")) {
      cleaned = "7" + cleaned.substring(1);
    }

    // Если не начинается с 7, добавляем 7
    if (!cleaned.startsWith("7")) {
      cleaned = "7" + cleaned;
    }

    // Ограничиваем длину до 11 цифр (7 + 10 цифр)
    cleaned = cleaned.substring(0, 11);

    // Форматируем: +7 (XXX) XXX-XX-XX
    let formatted = "+7";
    if (cleaned.length > 1) {
      formatted += " (" + cleaned.substring(1, 4);
    }
    if (cleaned.length >= 5) {
      formatted += ") " + cleaned.substring(4, 7);
    }
    if (cleaned.length >= 8) {
      formatted += "-" + cleaned.substring(7, 9);
    }
    if (cleaned.length >= 10) {
      formatted += "-" + cleaned.substring(9, 11);
    }

    return formatted;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    
    // Создаём новое событие с форматированным значением
    const syntheticEvent = {
      ...e,
      target: {
        ...e.target,
        name: name,
        value: formatted,
      },
    } as React.ChangeEvent<HTMLInputElement>;

    onChange(syntheticEvent);
  };

  return (
    <input
      ref={inputRef}
      type="tel"
      name={name}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
    />
  );
}

