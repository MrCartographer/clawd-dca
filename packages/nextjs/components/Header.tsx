"use client";

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
 * Site header — minimal nav for CLAWD DCA Engine.
 */
export const Header = () => {
  const pathname = usePathname();

  return (
    <div className="sticky lg:static top-0 navbar bg-base-100 min-h-0 shrink-0 justify-between z-20 shadow-md shadow-secondary px-2 sm:px-4">
      <div className="navbar-start">
        <Link href="/" passHref className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🦞</span>
          <div className="flex flex-col leading-tight">
            <span className="font-bold">CLAWD DCA</span>
            <span className="text-xs opacity-70">Stack CLAWD on autopilot</span>
          </div>
        </Link>
      </div>
      <div className="hidden md:flex navbar-center">
        <ul className="menu menu-horizontal gap-1">
          {navLinks.map(({ label, href }) => {
            const isActive = href === "/" ? pathname === "/" : pathname?.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  passHref
                  className={`${
                    isActive ? "bg-secondary shadow-md" : ""
                  } hover:bg-secondary hover:shadow-md py-1.5 px-3 text-sm rounded-full`}
                >
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="navbar-end gap-2">
        <div className="md:hidden dropdown dropdown-end">
          <label tabIndex={0} className="btn btn-ghost btn-sm">
            Menu
          </label>
          <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-30 p-2 shadow bg-base-100 rounded-box w-44">
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
  );
};
