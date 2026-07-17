export function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="relative h-5.5 w-10 flex-none cursor-pointer rounded-full transition-colors"
      style={{ background: checked ? "var(--color-forest-500)" : "var(--color-input-border)" }}
    >
      <div
        className="absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform"
        style={{ transform: checked ? "translateX(18px)" : "translateX(2px)" }}
      />
    </button>
  );
}
