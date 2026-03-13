/**
 * Hono app factory — runtime-agnostic.
 * Entry files (dev.ts, entry-cloudflare.ts, etc.) create dependencies
 * and call createApp() to get the Hono app.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { AppDeps, AppEnv } from './types'
import { health } from './routes/health'
import { apisRouter } from './routes/apis'

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>()

  // CORS — credentials required for auth cookies
  app.use('*', cors({
    origin: deps.auth
      ? (process.env.TRUSTED_ORIGINS || 'http://localhost:3000').split(',')
      : '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: !!deps.auth,
  }))

  // Inject dependencies into context
  app.use('*', async (c, next) => {
    c.set('deps', deps)
    c.set('user', null)
    c.set('session', null)
    await next()
  })

  // Mount better-auth handler (if configured)
  if (deps.auth) {
    const auth = deps.auth
    app.on(['POST', 'GET'], '/api/auth/*', (c) => {
      return auth.handler(c.req.raw)
    })
  }

  // Mount routes
  app.route('/', health)
  app.route('/', apisRouter)

  return app
}
