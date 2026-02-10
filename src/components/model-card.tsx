import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MODEL_COLORS } from "@/lib/models";
import { fmtDollars, fmtPct, fmtBrier } from "@/lib/format";
import type { ModelStats } from "@/lib/schemas";

interface ModelCardProps {
  model: ModelStats;
}

export function ModelCard({ model }: ModelCardProps) {
  const colors = MODEL_COLORS[model.model_id];
  const borderColor = colors?.primary ?? "#888";

  return (
    <Link href={`/models/${model.model_id}`}>
      <Card
        className="transition-colors hover:bg-accent/30"
        style={{ borderTopColor: borderColor, borderTopWidth: 3 }}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{model.avatar_emoji}</span>
            <div>
              <h3 className={`font-semibold ${colors?.text ?? ""}`}>{model.display_name}</h3>
              <Badge variant="secondary" className="text-[10px] font-normal">
                {model.provider}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Bankroll</p>
              <p className="font-mono font-semibold">{fmtDollars(model.bankroll)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">ROI</p>
              <p className={`font-mono font-semibold ${model.roi_pct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {model.roi_pct >= 0 ? "+" : ""}{fmtPct(model.roi_pct)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Brier</p>
              <p className="font-mono font-semibold">{fmtBrier(model.brier_score)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
