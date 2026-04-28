import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export async function GET(
	_request: Request,
	context: { params: Promise<{ nextauth?: string[] }> },
) {
	const { nextauth = [] } = await context.params;

	if (nextauth.length === 1 && nextauth[0] === "session") {
		return NextResponse.json(await auth());
	}

	return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function POST() {
	return NextResponse.json({ error: "Authentication routes are disabled in single-user mode." }, { status: 405 });
}