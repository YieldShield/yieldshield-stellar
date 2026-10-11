import React, { useEffect, useId, useRef, useState } from "react";

const primary = [
  ["/markets", "Markets"],
  ["/trade", "Trade"],
  ["/protect", "Protect"],
  ["/provide", "Provide"],
  ["/positions", "Portfolio"],
] as const;
const secondary = [
  ["/create-pool", "Create pool"],
  ["/activity", "Activity"],
  ["/assets", "Funding"],
  ["/account", "Account"],
  ["/how-it-works", "Learn"],
  ["/status", "Status"],
  ["/legacy", "Legacy market"],
] as const;

export function Navigation({ path, routeKey, href }: {
  path: string;
  routeKey: string;
  href: (path: string) => string;
}) {
  const [open, setOpen] = useState<"more" | "mobile">();
  const nav = useRef<HTMLElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => setOpen(undefined), [routeKey]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!nav.current?.contains(event.target as Node)) setOpen(undefined);
    };
    const breakpoint = window.matchMedia?.("(max-width: 700px)");
    const resized = () => setOpen(undefined);
    document.addEventListener("pointerdown", outside);
    breakpoint?.addEventListener("change", resized);
    return () => {
      document.removeEventListener("pointerdown", outside);
      breakpoint?.removeEventListener("change", resized);
    };
  }, []);
  function isCurrent(link: string) {
    return path === link || path.startsWith(`${link}/`) ||
      (link === "/assets" && path === "/faucet") ||
      (link === "/how-it-works" && path.startsWith("/learn/"));
  }
  function links(items: readonly (readonly [string, string])[]) {
    return items.map(([link, label]) => (
      <li key={link}>
        <a href={href(link)} aria-current={isCurrent(link) ? "page" : undefined}
          onClick={(event) => {
            setOpen(undefined);
            // The router focuses main when the pathname changes. A same-page
            // activation also needs a visible destination after this link hides.
            if (path === link && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey)
              document.getElementById("main-content")?.focus({ preventScroll: true });
          }}>{label}</a>
      </li>
    ));
  }
  return (
    <nav className="site-navigation" aria-label="Main navigation" ref={nav}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(undefined);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          (open === "more" ? more : menu).current?.focus();
          setOpen(undefined);
        }
      }}>
      <div className="desktop-navigation">
        <ul className="primary-links">{links(primary)}</ul>
        <div className="more-navigation" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(undefined);
        }}>
          <button className="navigation-toggle" ref={more} aria-expanded={open === "more"}
            aria-controls={`${id}-more`} onClick={() => setOpen(open === "more" ? undefined : "more")}>More</button>
          <ul className="secondary-links" id={`${id}-more`} hidden={open !== "more"}>
            {links(secondary)}
          </ul>
        </div>
      </div>
      <div className="mobile-navigation">
        <button className="navigation-toggle" ref={menu} aria-expanded={open === "mobile"}
          aria-controls={`${id}-mobile`} onClick={() => setOpen(open === "mobile" ? undefined : "mobile")}>Menu</button>
        <div className="mobile-links" id={`${id}-mobile`} hidden={open !== "mobile"}>
          <ul className="primary-links">{links(primary)}</ul>
          <ul className="secondary-links">{links(secondary)}</ul>
        </div>
      </div>
    </nav>
  );
}
