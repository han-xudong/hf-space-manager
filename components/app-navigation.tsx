"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/connections", label: "Connections" },
  { href: "/settings", label: "Settings" },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="shell-nav" aria-label="Primary">
      {navigation.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? "nav-link is-active" : "nav-link"}
            aria-current={isActive ? "page" : undefined}
          >
            <span className="nav-label">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}