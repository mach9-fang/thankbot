import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-rose-100/70 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-400 text-lg shadow-sm">
            🙏
          </span>
          <div>
            <p className="text-base font-semibold tracking-tight text-stone-900">
              ThankBot
            </p>
            <p className="text-xs text-stone-500">Celebrate your teammates</p>
          </div>
        </Link>
        <div className="hidden text-sm text-stone-500 sm:block">
          Slack:{" "}
          <code className="rounded-md bg-stone-100 px-2 py-1 text-stone-700">
            /thanks @name for …
          </code>
        </div>
      </div>
    </header>
  );
}
