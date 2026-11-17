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
  if (mimeType === "application/pdf") {
    return (
      <iframe
        src={src}
        title={`Forhåndsvisning af ${title}`}
        className="h-full min-h-[70vh] w-full rounded-md border border-border bg-white"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- authenticated file route, not a static asset
    <img
      src={src}
      alt={`Bilag: ${title}`}
      className="max-h-[75vh] w-full rounded-md border border-border bg-white object-contain"
    />
  );
}
