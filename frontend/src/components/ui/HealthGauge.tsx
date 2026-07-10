export function HealthGauge({ score, size = 118, label }: { score: number; size?: number; label: string }) {
  const inner = size * 0.746;
  return (
    <div
      className="grid place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(#40916C 0 ${score}%, #EDEAE0 ${score}% 100%)`,
      }}
    >
      <div
        className="grid place-items-center rounded-full bg-white text-center"
        style={{ width: inner, height: inner }}
      >
        <div>
          <div className="text-2xl font-extrabold leading-none text-forest-900">{score}%</div>
          <div className="text-[10px] font-semibold text-ink-400">{label}</div>
        </div>
      </div>
    </div>
  );
}
