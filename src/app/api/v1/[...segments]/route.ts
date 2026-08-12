import { getHttpApi } from "../../../../api/runtime";

type Context = { params: Promise<{ segments: string[] }> };
const parts = async (context: Context) => (await context.params).segments;
const notFound = () => Response.json({ error: "not_found" }, { status: 404 });

export async function GET(_request: Request, context: Context) {
  const s = await parts(context);
  const api = getHttpApi();
  if (s.length === 2 && s[0] === "polls") return api.getPoll(s[1]);
  if (s.length === 3 && s[0] === "polls" && s[2] === "results") return api.results(s[1]);
  if (s.length === 3 && s[0] === "polls" && s[2] === "calendar.ics") return api.calendar(s[1]);
  return notFound();
}

export async function POST(request: Request, context: Context) {
  const s = await parts(context);
  const api = getHttpApi();
  if (s.length === 1 && s[0] === "polls") return api.createPoll(request);
  if (s.length === 3 && s[0] === "polls" && s[2] === "slots") return api.addSlot(request, s[1]);
  if (s.length === 3 && s[0] === "polls" && s[2] === "participants") return api.createParticipant(request, s[1]);
  if (s.length === 3 && s[0] === "polls" && s[2] === "winner") return api.selectWinner(request, s[1]);
  if (s.length === 3 && s[0] === "polls" && s[2] === "close") return api.close(request, s[1]);
  if (s.length === 3 && s[0] === "polls" && s[2] === "reopen") return api.reopen(request, s[1]);
  return notFound();
}

export async function PATCH(request: Request, context: Context) {
  const s = await parts(context);
  if (s.length === 2 && s[0] === "polls") return getHttpApi().updatePoll(request, s[1]);
  return notFound();
}

export async function PUT(request: Request, context: Context) {
  const s = await parts(context);
  if (s.length === 4 && s[0] === "polls" && s[2] === "participants") return getHttpApi().updateParticipant(request, s[1], s[3]);
  return notFound();
}

export async function DELETE(request: Request, context: Context) {
  const s = await parts(context);
  const api = getHttpApi();
  if (s.length === 2 && s[0] === "polls") return api.deletePoll(request, s[1]);
  if (s.length === 4 && s[0] === "polls" && s[2] === "slots") return api.deleteSlot(request, s[1], s[3]);
  return notFound();
}
