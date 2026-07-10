export function LogoMark({ size = 18, leafColor = "#95D5B2", leafColorDark = "#40916C" }: { size?: number; leafColor?: string; leafColorDark?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18">
      <path d="M9 16 C9 9 12 5 16 3 C16 10 13 14 9 16 Z" fill={leafColor} />
      <path d="M9 16 C9 11 7 7 3 5 C3 11 5.5 14.5 9 16 Z" fill={leafColorDark} />
    </svg>
  );
}

export function Logo({ size = 34 }: { size?: number }) {
  return (
    <div
      className="grid flex-none place-items-center rounded-[10px] bg-forest-900"
      style={{ width: size, height: size }}
    >
      <LogoMark size={size * 0.53} />
    </div>
  );
}
