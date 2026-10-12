import type { ChangeEvent } from 'react';

export default function ToggleSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label htmlFor={id} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center">
      <span className="sr-only">{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-150 peer-focus-visible:ring-4 peer-focus-visible:ring-purple-300 motion-reduce:transition-none ${checked ? 'bg-purple-700' : 'bg-grey-500'}`}
      >
        <span className={`absolute left-1 size-6 rounded-full bg-white shadow-sm transition-transform duration-150 motion-reduce:transition-none ${checked ? 'translate-x-6' : ''}`} />
      </span>
    </label>
  );
}
