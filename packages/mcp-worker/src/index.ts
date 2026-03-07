/**
 * Hono app factory — runtime-agnostic.
 * Entry files (adapters/node.ts, etc.) create a TenantStore
 * and call createApp() to get the Hono app.
 */

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { TenantStore } from './types'
import { health } from './routes/health'
import { register } from './routes/register'
import { tenant } from './routes/tenant'
import { catalog } from './routes/catalog'

export type AppEnv = {
  Variables: {
    store: TenantStore
  }
}

export function createApp(store: TenantStore) {
  const app = new Hono<AppEnv>()

  // CORS — allow MCP-required headers
  app.use('*', cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'mcp-session-id', 'mcp-protocol-version', 'X-Forwarded-Api-Key', 'X-Api-Key', 'Authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['mcp-session-id'],
  }))

  // Inject store into context
  app.use('*', async (c, next) => {
    c.set('store', store)
    await next()
  })

  // Mount routes
  app.route('/', health)
  app.route('/', register)
  app.route('/', tenant)
  app.route('/', catalog)

  return app
}
