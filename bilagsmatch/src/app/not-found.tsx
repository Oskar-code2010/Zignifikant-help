import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3">
      <h1 className="text-xl font-semibold">Siden blev ikke fundet</h1>
      <Link href="/" className="text-primary underline">
        Gå til overblik
      </Link>
    </main>
  );
}
