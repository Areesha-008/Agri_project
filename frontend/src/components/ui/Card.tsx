import { HTMLAttributes } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`bg-cream-card border border-border rounded-card shadow-card p-5 ${className}`}
      {...props}
    />
  );
}
