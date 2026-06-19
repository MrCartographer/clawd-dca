"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

type ThemeKey = "light" | "medium" | "dark";

const OPTIONS: { key: ThemeKey; label: string; icon: React.ReactNode }[] = [
  {
    key: "light",
    label: "Light",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    key: "medium",
    label: "Medium",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {/* sun-half: half circle filled-ish */}
        <circle cx="12" cy="12" r="4" />
        <path d="M12 8a4 4 0 0 0 0 8z" fill="currentColor" stroke="none" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    key: "dark",
    label: "Dark",
    icon: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
];

export const ThemeToggle = () => {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Until the client mounts, render a stable skeleton so SSR/CSR match.
  if (!mounted) {
    return <div className="theme-toggle" aria-hidden style={{ width: 96, height: 30 }} />;
  }

  const current = (theme === "system" ? resolvedTheme : theme) as ThemeKey | undefined;
  const active: ThemeKey = current === "light" || current === "medium" || current === "dark" ? current : "dark";

  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {OPTIONS.map(({ key, label, icon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={label}
            title={label}
            data-active={isActive ? "true" : undefined}
            onClick={() => setTheme(key)}
            className="theme-toggle-btn"
          >
            {icon}
          </button>
        );
      })}
    </div>
  );
};
