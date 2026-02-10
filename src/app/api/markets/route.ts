import { NextRequest, NextResponse } from "next/server";
import { syncMarkets, getActiveMarkets, getAllMarkets } from "@/lib/polymarket";

// GET /api/markets?active=true&limit=100
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const active = searchParams.get("active") === "true";
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "100", 10) || 100, 1),
      500,
    );

    const markets = active ? await getActiveMarkets(limit) : await getAllMarkets(limit);
    return NextResponse.json(markets);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/markets  - trigger sync from Polymarket
export async function POST() {
  try {
    const synced = await syncMarkets();
    return NextResponse.json({ synced });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
