import Image from "next/image";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md rounded-3xl border border-brand-100 bg-white/80 p-10 text-center shadow-sm">
      <Image
        src="/thankbot-icon.png"
        alt=""
        width={64}
        height={64}
        className="mx-auto h-16 w-16 rounded-2xl shadow-sm"
      />
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-ink-900">
        Person not found
      </h1>
      <p className="mt-2 text-ink-500">
        We couldn&apos;t find that teammate on the board.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-brand-600/25 transition hover:bg-brand-700"
      >
        Back to board
      </Link>
    </div>
  );
}
