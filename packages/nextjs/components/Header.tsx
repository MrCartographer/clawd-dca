"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";

const navLinks: { label: string; href: string }[] = [
  { label: "Dashboard", href: "/" },
  { label: "Create", href: "/create" },
  { label: "Keepers", href: "/keepers" },
  { label: "Stats", href: "/stats" },
];

/**
 * Site header — Uniswap-style: brand on the left, centered pill nav,
 * connect button on the right.
 */
export const Header = () => {
  const pathname = usePathname();

  return (
    <header className="sticky lg:static top-0 z-20 w-full backdrop-blur-md bg-base-100/70 border-b border-[color:var(--ink-gray-40)]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-6 py-3">
        <Link href="/" passHref className="flex items-center gap-2.5 shrink-0 group">
          <span className="relative inline-block w-9 h-9 rounded-full overflow-hidden ring-1 ring-[color:var(--ink-gray-40)] bg-white">
            <Image
              src="/clawd-logo.png"
              alt="CLAWD"
              fill
              sizes="36px"
              className="object-cover transition-transform group-hover:scale-105"
              priority
            />
          </span>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="font-bold text-base">CLAWD DCA</span>
            <span className="text-[11px] opacity-60 tracking-wide">Stack on autopilot · Base</span>
          </div>
        </Link>

        <nav className="hidden md:flex">
          <div className="pill-nav">
            {navLinks.map(({ label, href }) => {
              const isActive = href === "/" ? pathname === "/" : pathname?.startsWith(href);
              return (
                <Link key={href} href={href} passHref className={isActive ? "is-active" : ""}>
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="flex items-center gap-2">
          <div className="md:hidden dropdown dropdown-end">
            <label tabIndex={0} className="btn btn-ghost btn-sm">
              Menu
            </label>
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content mt-3 z-30 p-2 shadow-lg bg-base-100 rounded-2xl w-44 border border-[color:var(--ink-gray-40)]"
            >
              {navLinks.map(({ label, href }) => (
                <li key={href}>
                  <Link href={href}>{label}</Link>
                </li>
              ))}
            </ul>
          </div>
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    </header>
  );
};
