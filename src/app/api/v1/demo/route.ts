import { makeDemoState } from "@/domain/demo";

export const dynamic = "force-static";

// Public synthetic fixtures only. Real records require authenticated, family-scoped endpoints.
export async function GET() {
  return Response.json({ mode: "demo", state: makeDemoState() });
}
