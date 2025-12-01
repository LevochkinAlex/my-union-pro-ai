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
}

export default function DateInput({
  name,
  value,
  onChange,
  onBlur,
  placeholder = "ДД.ММ.ГГГГ",
  className = "",
  disabled = false,
}: DateInputProps) {
  const [displayValue, setDisplayValue] = useState("");

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

  // Преобразование DD.MM.YYYY в YYYY-MM-DD
  const convertToISODate = (dateStr: string): string => {
    const cleaned = dateStr.replace(/\D/g, "");
    
    if (cleaned.length === 8) {
      const day = cleaned.substring(0, 2);
      const month = cleaned.substring(2, 4);
      const year = cleaned.substring(4, 8);
      
      // Простая валидация
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

  const defaultClassName = "w-full h-11 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-400";

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={displayValue}
        onChange={handleChange}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        className={className || defaultClassName}
        maxLength={10}
      />
    </div>
  );
}

