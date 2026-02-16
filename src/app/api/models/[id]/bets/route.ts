import { NextRequest, NextResponse } from "next/server";
import { queryAll } from "@/lib/db";
import type { BetRow } from "@/lib/schemas";

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const bets = await queryAll<BetRow>(
            "SELECT * FROM bets WHERE model_id = @model_id ORDER BY created_at DESC",
            { model_id: id }
        );

        return NextResponse.json(bets);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
