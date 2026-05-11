import { NextResponse } from 'next/server';

/**
 * Guard for destructive admin endpoints (wipe, delete, purge, restore).
 *
 * Returns null when the caller is allowed; returns a 403/503 NextResponse
 * when not. Designed for use at the top of POST handlers:
 *
 *   export async function POST(request: Request) {
 *     const denied = requireAdminToken(request);
 *     if (denied) return denied;
 *     // ...destructive work...
 *   }
 *
 * Two acceptable callers:
 *
 *   1. Manual / human  → query param `?token=...` matching `ADMIN_TOKEN` env
 *   2. Vercel Cron Job → Authorization header `Bearer <CRON_SECRET>` matching
 *      `CRON_SECRET` env (Vercel sets this automatically on cron requests
 *      when the env var is configured in the project)
 *
 * If neither env var is set, the endpoint returns 503 — admin operations
 * are disabled by default. Set ADMIN_TOKEN in .env (and Vercel project env)
 * to a long random string to enable manual destructive calls.
 *
 * GET handlers (preview / dry-run) are intentionally left open so anyone
 * can inspect what *would* happen without touching data.
 */
export function requireAdminToken(request: Request): NextResponse | null {
  const adminToken = process.env.ADMIN_TOKEN;
  const cronSecret = process.env.CRON_SECRET;

  // Path 1: Vercel cron — Authorization: Bearer <CRON_SECRET>
  if (cronSecret) {
    const auth = request.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return null;
  }

  // Path 2: manual call with ?token=... matching ADMIN_TOKEN
  if (!adminToken) {
    return NextResponse.json(
      {
        error: 'Admin endpoints disabled',
        hint: 'Set ADMIN_TOKEN in .env (and Vercel env) to enable. ' +
              'Cron jobs can also use Authorization: Bearer <CRON_SECRET>.',
      },
      { status: 503 },
    );
  }
  const provided = new URL(request.url).searchParams.get('token');
  if (!provided || provided !== adminToken) {
    return NextResponse.json(
      { error: 'Forbidden — missing or incorrect admin token' },
      { status: 403 },
    );
  }
  return null;
}
