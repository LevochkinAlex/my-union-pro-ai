"use client";

import { useState } from "react";
import Image from "next/image";

interface OptimizedAvatarProps {
  src: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
  fallbackInitials?: string;
  fallbackGradient?: string;
  onClick?: () => void;
}

// Генерирует градиент на основе имени
function getGradient(name: string): string {
  const gradients = [
    "from-blue-500 to-blue-600",
    "from-purple-500 to-purple-600",
    "from-pink-500 to-pink-600",
    "from-green-500 to-green-600",
    "from-orange-500 to-orange-600",
    "from-indigo-500 to-indigo-600",
  ];
  const index = (name.charCodeAt(0) || 0) % gradients.length;
  return gradients[index];
}

export default function OptimizedAvatar({
  src,
  alt,
  size = 40,
  className = "",
  fallbackInitials,
  fallbackGradient,
  onClick,
}: OptimizedAvatarProps) {
  const [error, setError] = useState(false);

  // Проверяем валидность URL
  const isValidUrl = src && 
    src.trim() !== "" && 
    (src.startsWith("http://") || 
     src.startsWith("https://") || 
     src.startsWith("/"));

  // Генерируем инициалы из alt если не переданы
  const initials = fallbackInitials || 
    alt.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase() || 
    "?";

  const gradient = fallbackGradient || getGradient(alt);

  // Показываем placeholder если нет URL или ошибка загрузки
  if (!isValidUrl || error) {
    return (
      <div
        onClick={onClick}
        className={`rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-semibold ${onClick ? "cursor-pointer" : ""} ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.35 }}
      >
        {initials}
      </div>
    );
  }

  // base64 data URLs не оптимизируем через Next.js Image
  if (src.startsWith("data:")) {
    return (
      <img
        src={src}
        alt={alt}
        onClick={onClick}
        className={`rounded-full object-cover ${onClick ? "cursor-pointer" : ""} ${className}`}
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div
      onClick={onClick}
      className={`relative rounded-full overflow-hidden ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="object-cover"
        loading="lazy"
        quality={size <= 50 ? 60 : 75}
        onError={() => setError(true)}
      />
    </div>
  );
}

