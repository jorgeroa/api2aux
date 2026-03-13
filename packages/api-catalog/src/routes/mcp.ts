/**
 * MCP Streamable HTTP endpoint for agent discovery.
 * Agents connect to /mcp and use search_catalog / get_api_details tools.
 */

import { Hono } from 'hono'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createCatalogServer } from '../services/catalog-server'
import type { AppEnv } from '../types'

const mcpRouter = new Hono<AppEnv>()

mcpRouter.all('/mcp', async (c) => {
  const { db, specStore } = c.get('deps')
  const mcpBaseUrl = new URL(c.req.url).origin

  const server = createCatalogServer({ db, specStore, mcpBaseUrl })
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })

  await server.connect(transport)
  return transport.handleRequest(c.req.raw)
})

export { mcpRouter }
