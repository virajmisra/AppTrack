import { NavLinks } from "@/components/nav-links";

export function Nav() {
  return (
    <nav className="border-b">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
        <span className="text-sm font-semibold tracking-tight">AppTrack</span>
        <NavLinks />
      </div>
    </nav>
  );
}
