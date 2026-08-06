import { POST as assistantV2Post } from "../assistant-v2/route";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return assistantV2Post(request);
}
