import Link from "next/link";

export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Event #{id}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        The live Events Page (Matchups and Leaderboard tabs) will live here
        (see milestones 5-8).
      </p>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
      >
        &larr; Back to Events
      </Link>
    </div>
  );
}
