/** Abstract symbols used as parallax decoration. Colours come from currentColor via className. */
type P = { className?: string };

/** Four-petal flower — echoes the mark in the CampusLink logo. */
export function Petal({ className }: P) {
  const petal = "M50 50 C 44 30, 30 12, 8 8 C 12 30, 30 44, 50 50 Z";
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      <path d={petal} />
      <path d={petal} transform="rotate(90 50 50)" />
      <path d={petal} transform="rotate(180 50 50)" />
      <path d={petal} transform="rotate(270 50 50)" />
    </svg>
  );
}

export function Ring({ className }: P) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="50" cy="50" r="47" />
      <circle cx="50" cy="50" r="33" strokeDasharray="3 5" />
    </svg>
  );
}

export function Plus({ className }: P) {
  return (
    <svg viewBox="0 0 40 40" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M20 4v32M4 20h32" />
    </svg>
  );
}

export function DotGrid({ className }: P) {
  const dots = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) dots.push(<circle key={`${r}-${c}`} cx={10 + c * 20} cy={10 + r * 20} r="2.5" />);
  return (
    <svg viewBox="0 0 100 100" className={className} fill="currentColor" aria-hidden="true">
      {dots}
    </svg>
  );
}

export function Arc({ className }: P) {
  return (
    <svg viewBox="0 0 100 60" className={className} fill="currentColor" aria-hidden="true">
      <path d="M0 60 A50 50 0 0 1 100 60 Z" />
    </svg>
  );
}
