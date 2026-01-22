/**
 * Единая дизайн-система для приложения
 * Все компоненты должны использовать эти константы для единообразия
 */

// ============================================================================
// ЦВЕТА
// ============================================================================

export const colors = {
  primary: {
    DEFAULT: 'blue',
    50: 'blue-50',
    100: 'blue-100',
    200: 'blue-200',
    300: 'blue-300',
    400: 'blue-400',
    500: 'blue-500',
    600: 'blue-600',
    700: 'blue-700',
    800: 'blue-800',
    900: 'blue-900',
  },
  gray: {
    50: 'gray-50',
    100: 'gray-100',
    200: 'gray-200',
    300: 'gray-300',
    400: 'gray-400',
    500: 'gray-500',
    600: 'gray-600',
    700: 'gray-700',
    800: 'gray-800',
    900: 'gray-900',
  },
  success: {
    50: 'green-50',
    500: 'green-500',
    600: 'green-600',
  },
  error: {
    50: 'red-50',
    500: 'red-500',
    600: 'red-600',
  },
  warning: {
    50: 'amber-50',
    500: 'amber-500',
    600: 'amber-600',
  },
} as const;

// ============================================================================
// РАДИУСЫ СКРУГЛЕНИЯ
// ============================================================================

export const borderRadius = {
  sm: 'rounded-md',      // 6px
  md: 'rounded-lg',       // 8px
  lg: 'rounded-xl',       // 12px
  xl: 'rounded-2xl',      // 16px
  full: 'rounded-full',   // 9999px
} as const;

// ============================================================================
// ОТСТУПЫ
// ============================================================================

export const spacing = {
  input: {
    paddingX: 'px-4',
    paddingY: 'py-2.5',
    padding: 'px-4 py-2.5',
  },
  button: {
    sm: 'px-3 py-2',
    md: 'px-4 py-2.5',
    lg: 'px-5 py-3',
  },
} as const;

// ============================================================================
// СТИЛИ ПОЛЕЙ ВВОДА
// ============================================================================

export const inputStyles = {
  base: `
    w-full
    ${spacing.input.padding}
    ${borderRadius.md}
    border
    text-sm
    shadow-sm
    placeholder:text-gray-400
    focus:outline-none
    focus:ring-2
    focus:ring-offset-2
    dark:bg-gray-800
    dark:text-white/90
    dark:placeholder:text-white/30
    dark:focus:ring-offset-gray-800
    transition-colors
  `,
  default: `
    text-gray-800
    border-gray-300
    focus:border-blue-500
    focus:ring-blue-500
    dark:border-gray-600
    dark:text-white/90
  `,
  error: `
    border-red-500
    focus:ring-red-500
    dark:border-red-500
  `,
  success: `
    border-green-500
    focus:ring-green-500
    dark:border-green-500
  `,
  disabled: `
    text-gray-500
    border-gray-300
    cursor-not-allowed
    dark:bg-gray-700
    dark:text-gray-400
    dark:border-gray-600
  `,
} as const;

// ============================================================================
// СТИЛИ КНОПОК
// ============================================================================

export const buttonStyles = {
  base: `
    inline-flex
    items-center
    justify-center
    font-semibold
    gap-2
    ${borderRadius.md}
    transition-colors
    focus:outline-none
    focus:ring-2
    focus:ring-offset-2
    dark:focus:ring-offset-gray-800
  `,
  primary: `
    bg-blue-600
    text-white
    shadow-sm
    hover:bg-blue-700
    focus:ring-blue-500
    disabled:bg-blue-400
    disabled:cursor-not-allowed
    disabled:opacity-60
  `,
  secondary: `
    bg-blue-100
    text-blue-700
    hover:bg-blue-200
    focus:ring-blue-500
    disabled:bg-blue-50
    dark:bg-blue-900/20
    dark:text-blue-400
    dark:hover:bg-blue-900/30
  `,
  outline: `
    bg-transparent
    text-gray-800
    ring-1
    ring-inset
    ring-gray-300
    hover:bg-gray-50
    focus:ring-blue-500
    dark:text-gray-200
    dark:ring-gray-600
    dark:hover:bg-gray-700
  `,
  ghost: `
    bg-transparent
    text-gray-700
    hover:bg-gray-100
    dark:text-gray-300
    dark:hover:bg-gray-800
  `,
  sizes: {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3 text-base',
  },
} as const;

// ============================================================================
// УТИЛИТЫ
// ============================================================================

/**
 * Объединяет классы стилей
 */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
