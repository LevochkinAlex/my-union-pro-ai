"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
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
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { height, width } = sizeMap[size];

  if (typeof window === 'undefined' || !mounted) {
    return (
      <Image
        src="/Logo_light_theme.svg"
        alt="MyUnion"
        width={width * 3} // Assume logo is 3x wider than tall
        height={height}
        className={`${className}`}
        priority
      />
    );
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const logoSrc = currentTheme === "dark" ? "/Logo_dark_theme.svg" : "/Logo_light_theme.svg";

  return (
    <Image
      src={logoSrc}
      alt="MyUnion"
      width={width * 3}
      height={height}
      className={`${className}`}
    />
  );
}

export function LogoIcon({ className = "", size = "md" }: LogoProps) {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { height, width } = sizeMap[size];

  if (typeof window === 'undefined' || !mounted) {
    return (
      <Image
        src="/icon_light.svg"
        alt="MyUnion Icon"
        width={width}
        height={height}
        className={`${className}`}
        priority
      />
    );
  }

  const currentTheme = theme === "system" ? resolvedTheme : theme;
  const iconSrc = currentTheme === "dark" ? "/icon_dark.svg" : "/icon_light.svg";

  return (
    <Image
      src={iconSrc}
      alt="MyUnion Icon"
      width={width}
      height={height}
      className={`${className}`}
    />
  );
}

