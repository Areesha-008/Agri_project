export function HealthGauge({ score, size = 118, label }: { score: number; size?: number; label: string }) {
  const inner = size * 0.746;
  // Scales with `size` instead of a fixed text-2xl — at size=58 (health page's "All
  // fields" grid) a fixed 24px number overflowed the ~43px inner circle.
  const scoreFontSize = size * 0.2;
  return (
    <div
      className="grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--color-forest-500) 0 ${score}%, var(--color-cream-inset) ${score}% 100%)`,
      }}
    >
      <div
        className="grid place-items-center rounded-full bg-cream-card text-center"
        style={{ width: inner, height: inner }}
      >
        <div>
          <div className="font-extrabold leading-none text-forest-ink-900" style={{ fontSize: scoreFontSize }}>
            {score}%
          </div>
          {label && <div className="text-[10px] font-semibold text-ink-400">{label}</div>}
        </div>
      </div>
    </div>
  );
}
