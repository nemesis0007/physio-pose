import Link from "next/link";

export function SiteHeader() {
  return (
    <nav className="topbar" aria-label="Primary navigation">
      <Link className="brand" href="/" aria-label="PhysioTwin home">
        <span className="brand-mark">PT</span>
        <span>
          <strong>PHYSIOTWIN</strong>
          <small>movement intelligence</small>
        </span>
      </Link>
      <div className="site-nav-links">
        <Link href="/">Assess</Link>
        <Link href="/exercises">Exercises</Link>
        <Link href="/how-it-works">How it works</Link>
      </div>
      <div className="nav-meta">
        <span className="privacy-dot" /> Private by default
        <span className="prototype-pill">Hackathon prototype</span>
      </div>
    </nav>
  );
}
