/**
 * Auth middleware for Hono.
 * Attaches session/user to context and optionally requires authentication.
 */

import type { Context, Next } from 'hono'
import type { AppEnv } from '../types'

/**
 * Middleware that requires a valid session.
 * Returns 401 if not authenticated.
 */
export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const auth = c.get('deps').auth
  if (!auth) {
    // Auth not configured (e.g., dev mode without OAuth creds) — skip
    await next()
    return
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session?.user) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  c.set('user', session.user)
  c.set('session', session.session)
  await next()
}
