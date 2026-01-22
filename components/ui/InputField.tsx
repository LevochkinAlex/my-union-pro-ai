import React, { FC } from "react";

interface InputProps {
  type?: "text" | "number" | "email" | "password" | "date" | "time" | string;
  id?: string;
  name?: string;
  placeholder?: string;
  defaultValue?: string | number;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  disabled?: boolean;
  success?: boolean;
  error?: boolean;
  hint?: string; // Optional hint text
  required?: boolean;
  maxLength?: number;
}

const Input: FC<InputProps> = ({
  type = "text",
  id,
  name,
  placeholder,
  defaultValue,
  value,
  onChange,
  className = "",
  min,
  max,
  step,
  disabled = false,
  success = false,
  error = false,
  hint,
  required,
  maxLength,
}) => {
  // Base Classes - используем единую дизайн-систему
  const baseClasses = "w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:ring-offset-gray-800 transition-colors";

  // State Classes - единый цвет blue вместо indigo
  let stateClasses = "";
  if (disabled) {
    stateClasses = `text-gray-500 border-gray-300 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600`;
  } else if (error) {
    stateClasses = `border-red-500 focus:ring-red-500 dark:border-red-500`;
  } else if (success) {
    stateClasses = `border-green-500 focus:ring-green-500 dark:border-green-500`;
  } else {
    stateClasses = `text-gray-800 border-gray-300 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:text-white/90`;
  }

  return (
    <div className="relative w-full">
      <input
        type={type}
        id={id}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        required={required}
        maxLength={maxLength}
        className={`${baseClasses} ${stateClasses} ${className}`}
      />

      {/* Optional Hint Text */}
      {hint && (
        <p
          className={`mt-1.5 text-xs ${
            error
              ? "text-red-600 dark:text-red-400"
              : success
              ? "text-green-600 dark:text-green-400"
              : "text-gray-500"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
};

export default Input;
