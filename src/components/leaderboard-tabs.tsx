"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LeaderboardTable } from "@/components/leaderboard-table";
import type { ModelStats } from "@/lib/schemas";

interface LeaderboardTabsProps {
  current: ModelStats[];
  allTime: ModelStats[];
}

export function LeaderboardTabs({ current, allTime }: LeaderboardTabsProps) {
  const [tab, setTab] = useState("current");

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="current">Current Cohort</TabsTrigger>
          <TabsTrigger value="alltime">All Time</TabsTrigger>
        </TabsList>
      </Tabs>
      <LeaderboardTable data={tab === "current" ? current : allTime} />
    </div>
  );
}
