import { NextRequest, NextResponse } from "next/server";
import { runRound } from "@/lib/prediction";
import { syncMarkets } from "@/lib/polymarket";
import { ensureActiveCohort } from "@/lib/cohort";
import { canAffordRound, getTotalSpent, getBudgetCap } from "@/lib/cost-tracker";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!(await canAffordRound())) {
      const spent = await getTotalSpent();
      const cap = getBudgetCap();
      return NextResponse.json({
        skipped: true,
        reason: `Budget exhausted. Spent $${spent.toFixed(2)} of $${cap.toFixed(2)} cap.`,
      });
    }

    const cohort = await ensureActiveCohort();
    await syncMarkets();

    const result = await runRound(cohort.id);
    const totalSpent = await getTotalSpent();

    return NextResponse.json({
      success: true,
      round_id: result.roundId,
      markets: result.marketCount,
      forecasts: result.forecastCount,
      ok: result.okCount,
      failed: result.failCount,
      round_cost: result.totalCost,
      total_spent: totalSpent,
      budget_remaining: getBudgetCap() - totalSpent,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
