import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean; // Error state
  hint?: string; // Hint text to display
  success?: boolean;
}

const TextArea: React.FC<TextareaProps> = ({
  className = "",
  disabled = false,
  error = false,
  success = false,
  hint = "",
  ...props
}) => {
  // Base Classes
  const baseClasses = "w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 dark:bg-gray-800 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:ring-offset-gray-800";

  // State Classes
  let stateClasses = "";
  if (disabled) {
    stateClasses = `text-gray-500 border-gray-300 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600`;
  } else if (error) {
    stateClasses = `border-red-500 focus:ring-red-500 dark:border-red-500`;
  } else if (success) {
    stateClasses = `border-green-500 focus:ring-green-500 dark:border-green-500`;
  } else {
    stateClasses = `text-gray-800 border-gray-300 focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:text-white/90`;
  }

  return (
    <div className="relative w-full">
      <textarea
        disabled={disabled}
        className={`${baseClasses} ${stateClasses} ${className}`}
        {...props}
      />
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

export default TextArea;
