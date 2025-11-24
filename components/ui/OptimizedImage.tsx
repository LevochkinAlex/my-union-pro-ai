"use client";

import { useState } from "react";
import Image from "next/image";

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  fill?: boolean;
  priority?: boolean;
  sizes?: string;
  objectFit?: "contain" | "cover" | "fill" | "none" | "scale-down";
}

/**
 * Компонент для оптимизированного отображения изображений
 * Использует next/image для автоматической оптимизации
 * Поддерживает fallback на обычный img для внешних изображений
 */
export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  className = "",
  fill = false,
  priority = false,
  sizes,
  objectFit = "cover",
}: OptimizedImageProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Если изображение не загрузилось или нужно использовать fallback
  if (useFallback || imageError) {
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={fill ? { width: "100%", height: "100%", objectFit } : undefined}
        onError={() => setImageError(true)}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }

  // Используем next/image для оптимизации
  try {
    if (fill) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          className={className}
          priority={priority}
          sizes={sizes}
          style={{ objectFit }}
          onError={() => setUseFallback(true)}
        />
      );
    }

    if (width && height) {
      return (
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className={className}
          priority={priority}
          sizes={sizes}
          style={{ objectFit }}
          onError={() => setUseFallback(true)}
        />
      );
    }

    // Если нет width/height, используем обычный img
    return (
      <img
        src={src}
        alt={alt}
        className={className}
        onError={() => setImageError(true)}
        loading={priority ? "eager" : "lazy"}
      />
    );
  } catch (error) {
    // Если next/image не может обработать изображение, используем fallback
    return (
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        onError={() => setImageError(true)}
        loading={priority ? "eager" : "lazy"}
      />
    );
  }
}

