import Link from "next/link";

export default function NewEventPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Create Event</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        The event creation form (title, rounds, team size, roster, and
        exclusions) will live here (see milestone 3).
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
