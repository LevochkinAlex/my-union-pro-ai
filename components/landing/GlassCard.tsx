import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}

export default function GlassCard({ children, className = "", hover = true }: Props) {
  return (
    <div
      className={`rounded-2xl ${hover ? "glass-card" : "glass"} ${className}`}
    >
      {children}
    </div>
  );
}
