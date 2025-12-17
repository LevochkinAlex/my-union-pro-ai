"use client";

import { useState } from "react";
import Image from "next/image";

interface OptimizedImageProps {
  src: string | null | undefined;
  alt: string;
  width?: number;
  height?: number;
  fill?: boolean;
  sizes?: string;
  className?: string;
  containerClassName?: string;
  priority?: boolean;
  quality?: number;
  onClick?: () => void;
  fallback?: React.ReactNode;
}

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  fill = false,
  sizes = "(max-width: 768px) 100vw, 50vw",
  className = "",
  containerClassName = "",
  priority = false,
  quality = 75,
  onClick,
  fallback,
}: OptimizedImageProps) {
  const [error, setError] = useState(false);

  // Проверяем валидность URL
  const isValidUrl = src && 
    src.trim() !== "" && 
    (src.startsWith("http://") || 
     src.startsWith("https://") || 
     src.startsWith("/"));

  // Показываем fallback если нет URL или ошибка загрузки
  if (!isValidUrl || error) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return null;
  }

  // base64 data URLs - показываем как есть (они уже в памяти)
  if (src.startsWith("data:")) {
    return (
      <div className={containerClassName}>
        <img
          src={src}
          alt={alt}
          onClick={onClick}
          className={`${onClick ? "cursor-pointer" : ""} ${className}`}
          style={width && height ? { width, height } : undefined}
        />
      </div>
    );
  }

  // Обычные URL - оптимизируем через Next.js Image
  if (fill) {
    return (
      <div className={`relative ${containerClassName}`}>
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className={`${onClick ? "cursor-pointer" : ""} ${className}`}
          loading={priority ? "eager" : "lazy"}
          priority={priority}
          quality={quality}
          onClick={onClick}
          onError={() => setError(true)}
        />
      </div>
    );
  }

  return (
    <div className={containerClassName}>
      <Image
        src={src}
        alt={alt}
        width={width || 800}
        height={height || 600}
        sizes={sizes}
        className={`${onClick ? "cursor-pointer" : ""} ${className}`}
        loading={priority ? "eager" : "lazy"}
        priority={priority}
        quality={quality}
        onClick={onClick}
        onError={() => setError(true)}
      />
    </div>
  );
}
