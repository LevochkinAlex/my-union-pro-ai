"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Image from "next/image";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-8",
  md: "h-12",
  lg: "h-16",
};

export default function Logo({ className = "", size = "md" }: LogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Показываем light logo пока не определилась тема
  if (!mounted) {
    return (
      <img
        src="/Logo_light_theme.svg"
        alt="MyUnion"
        className={`${sizeMap[size]} ${className}`}
      />
    );
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const logoSrc = currentTheme === "dark" ? "/Logo_dark_theme.svg" : "/Logo_light_theme.svg";

  return (
    <img
      src={logoSrc}
      alt="MyUnion"
      className={`${sizeMap[size]} ${className}`}
    />
  );
}

export function LogoIcon({ className = "", size = "md" }: LogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const iconSize = size === "sm" ? "w-8 h-8" : size === "lg" ? "w-16 h-16" : "w-12 h-12";

  if (!mounted) {
    return (
      <img
        src="/icon_light.svg"
        alt="MyUnion Icon"
        className={`${iconSize} ${className}`}
      />
    );
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const iconSrc = currentTheme === "dark" ? "/icon_dark.svg" : "/icon_light.svg";

  return (
    <img
      src={iconSrc}
      alt="MyUnion Icon"
      className={`${iconSize} ${className}`}
    />
  );
}

