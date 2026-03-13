/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

function corsProxyPlugin(): Plugin {
  return {
    name: 'cors-proxy',
    configureServer(server) {
      server.middlewares.use('/api-proxy', async (req, res) => {
        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
            'Access-Control-Max-Age': '86400',
          })
          res.end()
          return
        }

        const targetUrl = decodeURIComponent((req.url || '').replace(/^\//, '')).replace(/\/$/, '')
        if (!targetUrl.startsWith('http')) {
          res.writeHead(400, { 'Content-Type': 'text/plain' })
          res.end('Missing target URL')
          return
        }
        try {
          const headers: Record<string, string> = {}
          const parsed = new URL(targetUrl)
          for (const [key, value] of Object.entries(req.headers)) {
            if (key === 'host' || key === 'origin' || key === 'cookie') continue
            if (key === 'referer') {
              headers['referer'] = parsed.origin + '/'
              continue
            }
            if (typeof value === 'string') headers[key] = value
          }

          // Read request body for non-GET/HEAD methods
          let body: Buffer | undefined
          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
            }
            if (chunks.length > 0) body = Buffer.concat(chunks)
          }

          const resp = await fetch(targetUrl, {
            method: req.method,
            headers,
            ...(body && body.length > 0 ? { body } : {}),
          })
          res.writeHead(resp.status, {
            'Content-Type': resp.headers.get('content-type') || 'application/json',
            'Access-Control-Allow-Origin': '*',
          })
          const buffer = Buffer.from(await resp.arrayBuffer())
          res.end(buffer)
        } catch (err) {
          res.writeHead(502, { 'Content-Type': 'text/plain' })
          res.end(`Proxy error: ${err instanceof Error ? err.message : 'unknown'}`)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), corsProxyPlugin()],
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      buffer: 'buffer',
      // Shims for Node builtins used by @apidevtools/swagger-parser (see src/shims/)
      util: path.resolve(__dirname, './src/shims/util.ts'),
      path: path.resolve(__dirname, './src/shims/path.ts'),
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
})
