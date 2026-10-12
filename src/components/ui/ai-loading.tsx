import { LoaderCircle } from 'lucide-react';

export default function AiLoader({ label = "Summarizing…" }) {
  return (
    <div role="status" aria-label={label} className="flex size-16 shrink-0 items-center justify-center">
      <LoaderCircle
        aria-hidden="true"
        className="size-11 text-purple-600 motion-safe:animate-spin"
        strokeWidth={1.75}
      />
    </div>
  );
}
