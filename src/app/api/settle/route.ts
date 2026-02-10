import { NextResponse } from "next/server";
import { settleMarkets } from "@/lib/settlement";

export const maxDuration = 300;

export async function POST() {
  try {
    const result = await settleMarkets();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
