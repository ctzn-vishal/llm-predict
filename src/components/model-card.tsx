import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtBrier, fmtSkill, fmtPct } from "@/lib/format";
import type { ForecasterStats } from "@/lib/schemas";

interface ModelCardProps {
  model: ForecasterStats;
}

export function ModelCard({ model }: ModelCardProps) {
  const empty = model.n_resolved === 0;
  const isModel = model.kind === "model";
  const borderColor = model.color || "#888";

  const inner = (
    <Card
      className={isModel ? "h-full transition-colors hover:bg-accent/30" : "h-full"}
      style={{ borderTopColor: borderColor, borderTopWidth: 3 }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{model.avatar_emoji}</span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold" style={{ color: model.color }}>
              {model.display_name}
            </h3>
            <Badge variant="secondary" className="text-[10px] font-normal">
              {model.kind === "ensemble"
                ? "Aggregate"
                : model.kind === "crowd"
                  ? "Baseline"
                  : model.provider}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Skill vs Crowd</p>
            {empty || model.kind === "crowd" ? (
              <p className="font-mono font-semibold text-muted-foreground">—</p>
            ) : (
              <p
                className={`font-mono font-semibold ${model.skill_vs_crowd >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {fmtSkill(model.skill_vs_crowd)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Brier</p>
            <p className="font-mono font-semibold">{empty ? "—" : fmtBrier(model.brier)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Log Loss</p>
            <p className="font-mono font-semibold">{empty ? "—" : model.log_loss.toFixed(3)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Forecasts (resolved)</p>
            <p className="font-mono font-semibold">
              {model.n_total} <span className="text-muted-foreground">({model.n_resolved})</span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Reliability</p>
            <p className="font-mono font-semibold">{fmtPct(model.ok_rate * 100)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (!isModel) return inner;
  return <Link href={`/models/${model.forecaster_id}`}>{inner}</Link>;
}
