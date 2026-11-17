export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Indlæser…</span>
      <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-lg border border-border bg-card" />
    </div>
  );
}
