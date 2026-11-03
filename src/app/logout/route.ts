import { destroySession } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  await destroySession();
  return NextResponse.redirect(new URL("/", new URL(req.url).origin), 303);
}
