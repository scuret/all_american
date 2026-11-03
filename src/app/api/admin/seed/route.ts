import { NextResponse } from "next/server";
import { db } from "@/db";
import { runSeed } from "@/db/seed";

export const maxDuration = 300;

/**
 * Loads demo data. WIPES the database. Protected by CRON_SECRET.
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/admin/seed
 */
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new NextResponse("Unauthorized", { status: 401 });
  const result = await runSeed(db);
  return NextResponse.json({ ok: true, ...result });
}
