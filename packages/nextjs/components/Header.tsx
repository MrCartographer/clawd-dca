"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "~~/components/ThemeToggle";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const navLinks: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/" },
  { label: "Create", href: "/create" },
  { label: "Keepers", href: "/keepers" },
  { label: "Stats", href: "/stats" },
  { label: "Why DCA", href: "/why-dca" },
];

/**
 * Site header — Uniswap-style: brand on the left, centered pill nav,
 * connect button on the right.
 */
export const Header = () => {
  const pathname = usePathname();

  return (
    <header className="topbar w-full">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 h-14">
        <Link href="/" passHref className="flex items-center gap-2.5 shrink-0 group">
          <span className="relative inline-block w-8 h-8 rounded-full overflow-hidden ring-1 ring-[color:var(--clawd-line)] bg-[color:var(--surface-1)]">
            <Image
              src="/clawd-original.jpg"
              alt="CLAWD"
              fill
              sizes="32px"
              className="object-cover transition-transform group-hover:scale-105"
              priority
            />
          </span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px] tracking-tight">CLAWD DCA</span>
            <span className="chip chip-orange hidden sm:inline-flex">v3 · Base</span>
          </div>
        </Link>

        <nav className="hidden md:flex">
          <div className="tabnav">
            {navLinks.map(({ label, href }) => {
              const isActive = href === "/" ? pathname === "/" : pathname?.startsWith(href);
              return (
                <Link key={href} href={href} passHref className={isActive ? "active" : ""}>
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center gap-2">
          <div className="md:hidden dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-sm">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </label>
            <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-30 p-2 surface w-44">
              {navLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <ThemeToggle />
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    </header>
  );
};
