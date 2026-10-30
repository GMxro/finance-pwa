import './Progress.css';

interface ProgressProps {
  value: number;
  tone?: 'ink' | 'danger' | 'onInk';
  label?: string;
}

export function Progress({ value, tone = 'ink', label }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={`ui-progress ui-progress--${tone}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <span className="ui-progress__fill" style={{ width: `${clamped}%` }} />
    </div>
  );
}
