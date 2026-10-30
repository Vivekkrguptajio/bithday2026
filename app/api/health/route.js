export const dynamic = 'force-dynamic';

// Render's health check + the keep-alive ping hit this.
export function GET() {
  return Response.json({ ok: true, time: Date.now() });
}
