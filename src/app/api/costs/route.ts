import { NextResponse } from "next/server";
import { getCostSummary } from "@/lib/cost-tracker";

export async function GET() {
  try {
    const summary = await getCostSummary();
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
