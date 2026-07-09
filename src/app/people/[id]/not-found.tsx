import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-rose-100 bg-white/80 p-10 text-center shadow-sm">
      <p className="text-4xl">🙏</p>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-stone-900">
        Person not found
      </h1>
      <p className="mt-2 text-stone-500">
        We couldn&apos;t find that teammate on the board.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-rose-500 px-4 py-2 text-sm font-medium text-white hover:bg-rose-600"
      >
        Back to board
      </Link>
    </div>
  );
}
