import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    users: [
      {
        id: "1",
        email: "test@example.com",
        display_name: "Test User",
        created_at: new Date().toISOString(),
        last_sign_in_at: null,
        email_confirmed_at: new Date().toISOString(),
      },
    ],
  });
}