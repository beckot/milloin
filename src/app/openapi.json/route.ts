import { openApiDocument } from "../../api/openapi";

export async function GET() {
  return Response.json(openApiDocument, {
    headers: {
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex",
    },
  });
}
