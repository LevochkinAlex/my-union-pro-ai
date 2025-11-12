import React, { ReactNode } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode; // Button text or content
  size?: "sm" | "md" | "lg"; // Button size
  variant?: "primary" | "secondary" | "outline"; // Button variant
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  className?: string; // Additional classes
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  className = "",
  disabled = false,
  ...props
}) => {
  // Base Classes
  const baseClasses = "inline-flex items-center justify-center font-semibold gap-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-gray-800";

  // Size Classes
  const sizeClasses = {
    sm: "px-3 py-2 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base",
  };

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus:ring-indigo-500 disabled:bg-indigo-400",
    secondary:
      "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 focus:ring-indigo-500 disabled:bg-indigo-50",
    outline:
      "bg-transparent text-gray-800 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:ring-indigo-500 dark:text-gray-200 dark:ring-gray-600 dark:hover:bg-gray-700",
  };

  return (
    <button
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      } ${className}`}
      disabled={disabled}
      {...props}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
};

export default Button;
