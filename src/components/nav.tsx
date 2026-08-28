import Link from "next/link";

export function Nav() {
  return (
    <nav className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">AppTrack</span>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          Postings
        </Link>
        <Link href="/applications" className="text-sm text-muted-foreground hover:text-foreground">
          Applications
        </Link>
      </div>
    </nav>
  );
}
