import { ExternalLink } from "lucide-react";

export function DocumentPreview({
  id,
  mimeType,
  title,
}: {
  id: string;
  mimeType: string;
  title: string;
}) {
  const src = `/api/documents/${id}/file`;
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex justify-end">
        <a
          href={src}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden /> Åbn i ny fane
        </a>
      </div>
      {mimeType === "application/pdf" ? (
        <iframe
          src={src}
          title={`Forhåndsvisning af ${title}`}
          className="h-full min-h-[70vh] w-full flex-1 rounded-md border border-border bg-white"
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated file route, not a static asset
        <img
          src={src}
          alt={`Bilag: ${title}`}
          className="max-h-[75vh] w-full rounded-md border border-border bg-white object-contain"
        />
      )}
    </div>
  );
}
