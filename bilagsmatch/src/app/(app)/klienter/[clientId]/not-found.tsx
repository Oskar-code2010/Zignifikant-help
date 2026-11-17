import Link from "next/link";

export default function ClientNotFound() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-6 py-12 text-center">
      <h1 className="text-lg font-semibold">Klienten eller bilaget findes ikke</h1>
      <p className="text-sm text-muted-foreground">
        Den er måske slettet, eller du har ikke adgang til den.
      </p>
      <Link href="/klienter" className="text-primary underline">
        Til klientoversigten
      </Link>
    </div>
  );
}
