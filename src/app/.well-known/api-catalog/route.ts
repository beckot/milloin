const profile = "https://www.rfc-editor.org/info/rfc9727";

function links(request: Request) {
  const origin = new URL(request.url).origin;
  const catalog = `${origin}/.well-known/api-catalog`;
  return {
    origin,
    catalog,
    linkHeader: `<${catalog}>; rel="api-catalog"`,
  };
}

export async function GET(request: Request) {
  const { origin, linkHeader } = links(request);
  return Response.json(
    {
      linkset: [
        {
          anchor: `${origin}/api/v1`,
          "service-desc": [
            {
              href: `${origin}/openapi.json`,
              type: "application/json",
            },
          ],
        },
      ],
    },
    {
      headers: {
        "content-type": `application/linkset+json; profile="${profile}"`,
        link: linkHeader,
        "cache-control": "public, max-age=300",
        "x-robots-tag": "noindex",
      },
    },
  );
}

export async function HEAD(request: Request) {
  const { linkHeader } = links(request);
  return new Response(null, {
    status: 200,
    headers: {
      "content-type": `application/linkset+json; profile="${profile}"`,
      link: linkHeader,
      "x-robots-tag": "noindex",
    },
  });
}
