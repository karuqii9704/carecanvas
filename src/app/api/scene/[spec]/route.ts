import { parseSceneSlug, renderSceneSvg } from "@/domain/scene";

export async function GET(_request: Request, context: { params: Promise<{ spec: string }> }) {
  const { spec: slug } = await context.params;
  const spec = parseSceneSlug(slug);
  if (!spec) return new Response("Unknown scene.", { status: 404 });
  return new Response(renderSceneSvg(spec), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // Same slug always renders the same bytes.
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
