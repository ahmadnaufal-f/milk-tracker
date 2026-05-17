export default function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="group inline-flex cursor-pointer items-center select-none">
      {/* Hidden native checkbox */}
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={onChange}
      />

      {/* Track */}
      <span
        className={[
          "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full",
          "transition-colors duration-300 ease-in-out",
          checked
            ? "bg-[var(--color-purple-600)] ring-[var(--color-purple-600)]"
            : "bg-[var(--color-grey-500)] ring-[var(--color-grey-500)]",
          "group-focus-within:ring-[var(--color-purple-400)]",
        ].join(" ")}
      >

        {/* Handle — star-shaped via clip-path */}
        <span
          className="relative inline-block h-5 w-5 bg-[var(--color-purple-50)]"
          style={{
            clipPath:
              "polygon(50% 0%, 68% 32%, 100% 50%, 68% 68%, 50% 100%, 32% 68%, 0% 50%, 32% 32%)",
            transform: `translateX(${checked ? "1.75rem" : "0.25rem"}) rotate(${checked ? "180deg" : "0deg"})`,
            transition:
              "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 200ms ease",
            boxShadow: checked
              ? "0 0 8px 2px color-mix(in oklch, var(--color-purple-400) 60%, transparent)"
              : "0 2px 4px color-mix(in oklch, var(--color-purple-700) 20%, transparent)",
          }}
          aria-hidden="true"
        />
      </span>
    </label>
  );
}
