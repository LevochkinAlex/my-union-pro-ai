"use client";

import Image from "next/image";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { height: 32, width: 32 },
  md: { height: 48, width: 48 },
  lg: { height: 64, width: 64 },
};

export default function Logo({ className = "", size = "md" }: LogoProps) {
  const { height, width } = sizeMap[size];

  // Используем CSS для переключения логотипа - без "моргания"
  return (
    <div className={`relative ${className}`} style={{ width: width * 3, height }}>
      {/* Светлый логотип - виден в светлой теме, скрыт в тёмной */}
      <Image
        src="/Logo_light_theme.svg"
        alt="MyUnion"
        width={width * 3}
        height={height}
        className="dark:hidden"
        priority
      />
      {/* Тёмный логотип - скрыт в светлой теме, виден в тёмной */}
      <Image
        src="/Logo_dark_theme.svg"
        alt="MyUnion"
        width={width * 3}
        height={height}
        className="hidden dark:block absolute top-0 left-0"
        priority
      />
    </div>
  );
}

export function LogoIcon({ className = "", size = "md" }: LogoProps) {
  const { height, width } = sizeMap[size];

  // Используем CSS для переключения иконки - без "моргания"
  return (
    <div className={`relative ${className}`} style={{ width, height }}>
      {/* Светлая иконка - видна в светлой теме, скрыта в тёмной */}
      <Image
        src="/icon_light.svg"
        alt="MyUnion Icon"
        width={width}
        height={height}
        className="dark:hidden"
        priority
      />
      {/* Тёмная иконка - скрыта в светлой теме, видна в тёмной */}
      <Image
        src="/icon_dark.svg"
        alt="MyUnion Icon"
        width={width}
        height={height}
        className="hidden dark:block absolute top-0 left-0"
        priority
      />
    </div>
  );
}
