"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Trophy,
  Swords,
  Calendar,
  BarChart3,
  Bot,
  BookOpen,
  TrendingUp,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Leaderboard", icon: Trophy },
  { href: "/arena", label: "Arena", icon: Swords },
  { href: "/cohorts", label: "Cohorts", icon: Calendar },
  { href: "/markets", label: "Markets", icon: TrendingUp },
  { href: "/rounds", label: "Rounds", icon: BarChart3 },
  { href: "/models", label: "Models", icon: Bot },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
  { href: "/about", label: "About", icon: Info },
];

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <Swords className="h-5 w-5 text-primary" />
        <span className="text-sm font-bold tracking-tight">
          LLM Prediction Arena
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-2 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          7 models competing on Polymarket
        </p>
      </div>
    </aside>
  );
}
