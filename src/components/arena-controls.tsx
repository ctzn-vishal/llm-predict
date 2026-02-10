"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Swords, CheckCircle2, AlertCircle } from "lucide-react";

export function ArenaControls() {
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function handleNewRound() {
    setStatus("running");
    setResult("");
    try {
      const res = await fetch("/api/rounds", { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to start round");
      }
      const data = await res.json();
      setStatus("done");
      setResult(`Round ${data.round_id?.slice(0, 8) ?? ""} completed with ${data.bet_count ?? 0} bets across ${data.market_count ?? 0} markets.`);
    } catch (e: unknown) {
      setStatus("error");
      setResult(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <div className="space-y-4">
      <Button
        size="lg"
        onClick={handleNewRound}
        disabled={status === "running"}
        className="gap-2"
      >
        {status === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Swords className="h-4 w-4" />
        )}
        {status === "running" ? "Running Round..." : "New Round"}
      </Button>

      {status === "running" && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <Loader2 className="h-5 w-5 animate-spin text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Round in progress</p>
              <p className="text-xs text-muted-foreground">
                All 7 models are analyzing markets and placing bets. This may take 30-60 seconds.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "done" && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Round completed</p>
              <p className="text-xs text-muted-foreground">{result}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {status === "error" && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">Error</p>
              <p className="text-xs text-muted-foreground">{result}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
