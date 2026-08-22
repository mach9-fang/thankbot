export function SignOutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button
        type="submit"
        className="rounded-xl border border-ink-200 px-3 py-1.5 text-sm text-ink-600 transition hover:border-brand-200 hover:bg-white hover:text-ink-900"
      >
        Sign out
      </button>
    </form>
  );
}
