import { NextResponse } from "next/server";
import { settleForecasts } from "@/lib/settlement";

export const maxDuration = 300;

export async function POST() {
  try {
    const result = await settleForecasts();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
