import { getHttpApi } from "../../../../api/runtime";

type Context = { params: Promise<{ segments: string[] }> };

const parts = async (context: Context) => (await context.params).segments;
const notFound = () => Response.json({ error: "not_found", message: "API route not found" }, { status: 404 });

export async function GET(_request: Request, context: Context) {
  const segments = await parts(context);
  const api = getHttpApi();

  if (segments.length === 2 && segments[0] === "polls") {
    return api.getPoll(segments[1]);
  }
  if (segments.length === 3 && segments[0] === "polls" && segments[2] === "calendar.ics") {
    return api.calendar(segments[1]);
  }
  return notFound();
}

export async function POST(request: Request, context: Context) {
  const segments = await parts(context);
  const api = getHttpApi();

  if (segments.length === 1 && segments[0] === "polls") return api.createPoll(request);
  if (segments.length === 3 && segments[0] === "polls" && segments[2] === "slots") {
    return api.addSlot(request, segments[1]);
  }
  if (segments.length === 3 && segments[0] === "polls" && segments[2] === "participants") {
    return api.createParticipant(request, segments[1]);
  }
  if (segments.length === 3 && segments[0] === "polls" && segments[2] === "winner") {
    return api.selectWinner(request, segments[1]);
  }
  if (segments.length === 3 && segments[0] === "polls" && segments[2] === "close") {
    return api.close(request, segments[1]);
  }
  if (segments.length === 3 && segments[0] === "polls" && segments[2] === "reopen") {
    return api.reopen(request, segments[1]);
  }
  return notFound();
}

export async function PUT(request: Request, context: Context) {
  const segments = await parts(context);
  if (
    segments.length === 4 &&
    segments[0] === "polls" &&
    segments[2] === "participants"
  ) {
    return getHttpApi().updateParticipant(request, segments[1], segments[3]);
  }
  return notFound();
}

export async function DELETE(request: Request, context: Context) {
  const segments = await parts(context);
  const api = getHttpApi();

  if (segments.length === 2 && segments[0] === "polls") {
    return api.deletePoll(request, segments[1]);
  }
  if (segments.length === 4 && segments[0] === "polls" && segments[2] === "slots") {
    return api.deleteSlot(request, segments[1], segments[3]);
  }
  return notFound();
}
