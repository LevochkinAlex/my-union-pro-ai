"use client";

import { useState, useEffect } from "react";

interface DateInputProps {
  name?: string;
  value: string;
  onChange: ((value: string) => void) | ((e: React.ChangeEvent<HTMLInputElement>) => void);
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: string;
  maxAge?: number; // Максимальный возраст в годах (по умолчанию 100)
  minAge?: number; // Минимальный возраст в годах (по умолчанию 0, т.е. дата не может быть в будущем)
}

export default function DateInput({
  name,
  value,
  onChange,
  onBlur,
  placeholder = "ДД.ММ.ГГГГ",
  className = "",
  disabled = false,
  error: externalError,
  maxAge = 100,
  minAge = 0,
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Преобразование YYYY-MM-DD в DD.MM.YYYY для отображения
  useEffect(() => {
    if (value && value.includes("-")) {
      const [year, month, day] = value.split("-");
      setDisplayValue(`${day}.${month}.${year}`);
    } else {
      setDisplayValue(value);
    }
  }, [value]);

  // Форматирование даты при вводе
  const formatDate = (input: string): string => {
    // Удаляем все нецифровые символы
    const cleaned = input.replace(/\D/g, "");

    // Ограничиваем длину до 8 цифр (ДДММГГГГ)
    const limited = cleaned.substring(0, 8);

    // Форматируем: ДД.ММ.ГГГГ
    let formatted = "";
    if (limited.length > 0) {
      formatted = limited.substring(0, 2);
    }
    if (limited.length >= 3) {
      formatted += "." + limited.substring(2, 4);
    }
    if (limited.length >= 5) {
      formatted += "." + limited.substring(4, 8);
    }

    return formatted;
  };

  // Валидация возраста
  const validateAge = (dateStr: string): string | null => {
    const cleaned = dateStr.replace(/\D/g, "");
    
    if (cleaned.length !== 8) {
      return null; // Неполная дата, пока не валидируем
    }
    
    const day = cleaned.substring(0, 2);
    const month = cleaned.substring(2, 4);
    const year = cleaned.substring(4, 8);
    
    const dayNum = parseInt(day, 10);
    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10);
    
    // Проверка корректности даты
    if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12 || yearNum < 1900 || yearNum > 2100) {
      return null; // Некорректная дата, но не ошибка возраста
    }
    
    const birthDate = new Date(yearNum, monthNum - 1, dayNum);
    const today = new Date();
    
    // Проверка, что дата не в будущем
    if (birthDate > today) {
      return "Дата рождения не может быть в будущем";
    }
    
    // Проверка минимального возраста (дата не должна быть слишком далеко в будущем)
    const ageInYears = (today.getTime() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (ageInYears < minAge) {
      return `Возраст должен быть не менее ${minAge} ${minAge === 1 ? 'года' : 'лет'}`;
    }
    
    // Проверка максимального возраста
    if (ageInYears > maxAge) {
      return `Возраст не может превышать ${maxAge} ${maxAge === 1 ? 'год' : 'лет'}`;
    }
    
    return null;
  };

  // Преобразование DD.MM.YYYY в YYYY-MM-DD
  const convertToISODate = (dateStr: string): string => {
    const cleaned = dateStr.replace(/\D/g, "");
    
    if (cleaned.length === 8) {
      const day = cleaned.substring(0, 2);
      const month = cleaned.substring(2, 4);
      const year = cleaned.substring(4, 8);
      
      // Простая проверка
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        return `${year}-${month}-${day}`;
      }
    }
    
    return "";
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatDate(e.target.value);
    setDisplayValue(formatted);

    // Конвертируем в ISO формат для сохранения
    const isoDate = convertToISODate(formatted);
    const finalValue = isoDate || formatted;
    
    // Валидация возраста
    const ageError = validateAge(formatted);
    setValidationError(ageError);
    
    if (onChange.length === 1) {
      // Новый интерфейс: onChange(value: string)
      (onChange as (value: string) => void)(finalValue);
    } else {
      // Старый интерфейс: onChange(e: React.ChangeEvent<HTMLInputElement>)
      const syntheticEvent = {
        ...e,
        target: {
          ...e.target,
          name: name || "",
          value: finalValue,
        },
      } as React.ChangeEvent<HTMLInputElement>;
      (onChange as (e: React.ChangeEvent<HTMLInputElement>) => void)(syntheticEvent);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    // При потере фокуса проверяем валидность
    if (displayValue) {
      const ageError = validateAge(displayValue);
      setValidationError(ageError);
    }
    onBlur?.(e);
  };

  const error = externalError || validationError;

  const defaultClassName = "w-full h-11 appearance-none rounded-lg border px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400";
  
  const borderClassName = error
    ? "border-red-500 focus:border-red-500 dark:border-red-500"
    : "border-gray-300 focus:border-blue-500 dark:border-gray-600";

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={`${className || defaultClassName} ${borderClassName}`}
        maxLength={10}
      />
      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}

