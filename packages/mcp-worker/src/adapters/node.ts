/**
 * Node.js entry point — combined server.
 * Serves MCP worker routes + static app files + CORS proxy.
 */

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp } from '../index'
import { MemoryTenantStore } from '../stores/memory-store'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const store = new MemoryTenantStore()
const mcpApp = createApp(store)

const app = new Hono()

// Mount MCP worker routes
app.route('/', mcpApp)

// CORS proxy — mirrors the Vite dev plugin behavior
app.all('/api-proxy/*', async (c) => {
  const req = c.req

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
        'Access-Control-Max-Age': '86400',
      },
    })
  }

  const encodedTarget = req.path.replace('/api-proxy/', '')
  const targetUrl = decodeURIComponent(encodedTarget)

  if (!targetUrl.startsWith('http')) {
    return c.text('Missing or invalid target URL', 400)
  }

  try {
    const parsed = new URL(targetUrl)
    const headers: Record<string, string> = {}
    const skipHeaders = new Set(['host', 'origin', 'cookie', 'connection'])

    for (const [key, value] of req.raw.headers.entries()) {
      if (skipHeaders.has(key.toLowerCase())) continue
      if (key.toLowerCase() === 'referer') {
        headers['referer'] = parsed.origin + '/'
        continue
      }
      headers[key] = value
    }

    // Forward body for non-GET/HEAD
    let body: ArrayBuffer | undefined
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.arrayBuffer()
    }

    const resp = await fetch(targetUrl, {
      method: req.method,
      headers,
      ...(body && body.byteLength > 0 ? { body } : {}),
    })

    const responseHeaders = new Headers(resp.headers)
    responseHeaders.set('Access-Control-Allow-Origin', '*')

    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers: responseHeaders,
    })
  } catch (err) {
    return c.text(`Proxy error: ${err instanceof Error ? err.message : 'unknown'}`, 502)
  }
})

// Serve static app files (built app)
const appDistPath = path.resolve(__dirname, '../../app/dist')
const relativeAppDist = path.relative(process.cwd(), appDistPath)

app.use('/*', serveStatic({ root: relativeAppDist }))

// SPA fallback — serve index.html for all non-file routes
app.use('/*', serveStatic({ root: relativeAppDist, path: 'index.html' }))

const port = parseInt(process.env.PORT || '8787', 10)

console.log(`Server running on http://localhost:${port}`)
serve({ fetch: app.fetch, port })
