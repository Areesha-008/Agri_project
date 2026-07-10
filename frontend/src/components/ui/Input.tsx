import { InputHTMLAttributes } from "react";

export function Input({
  label,
  hint,
  className = "",
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-ink-600">
          {label} {hint && <span className="font-normal text-ink-400">{hint}</span>}
        </label>
      )}
      <input
        id={id}
        className={`rounded-[10px] border border-input-border bg-cream-card px-3.5 py-2.5 text-[13.5px] outline-none focus:border-forest-500 ${className}`}
        {...props}
      />
    </div>
  );
}
