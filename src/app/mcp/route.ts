import { getMcpHandler } from "../../mcp/runtime";

const handle = (request: Request) => getMcpHandler().fetch(request);

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}

export async function DELETE(request: Request) {
  return handle(request);
}
