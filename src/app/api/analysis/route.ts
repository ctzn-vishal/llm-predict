import { NextRequest, NextResponse } from "next/server";
import {
  getEnsembleComparison,
  getEnsembleSizeCurve,
  getErrorCorrelationMatrix,
} from "@/lib/scoring";

// Powers the "Lesson" page: does pooling many models (and an ensemble) beat the
// crowd, and why? Returns the headline comparison, the marginal-value curve,
// and the error-correlation matrix in one shot.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cohortId = searchParams.get("cohort_id") ?? undefined;

    const [comparison, sizeCurve, correlation] = await Promise.all([
      getEnsembleComparison(cohortId),
      getEnsembleSizeCurve(cohortId),
      getErrorCorrelationMatrix(cohortId),
    ]);

    return NextResponse.json({ comparison, sizeCurve, correlation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
