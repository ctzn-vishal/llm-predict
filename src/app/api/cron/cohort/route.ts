import { NextRequest, NextResponse } from "next/server";
import { createWeeklyCohort } from "@/lib/cohort";
import { canAffordRound, getTotalSpent, getBudgetCap } from "@/lib/cost-tracker";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (!(await canAffordRound())) {
      return NextResponse.json({
        skipped: true,
        reason: `Budget exhausted. Spent $${(await getTotalSpent()).toFixed(2)} of $${getBudgetCap().toFixed(2)} cap.`,
      });
    }

    const result = await createWeeklyCohort();
    if (!result.created) {
      return NextResponse.json({ skipped: true, reason: result.reason });
    }
    return NextResponse.json({ success: true, cohort_id: result.cohortId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
