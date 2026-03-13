/**
 * MCP server for agent discovery of APIs in the catalog.
 *
 * Tools:
 * - search_catalog — faceted search across all APIs
 * - get_api_details — full metadata + operations for a specific API
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { ApiRepository } from '../repositories/api-repository'
import { ApiService } from '../services/api-service'
import { SpecResolver } from './spec-resolver'
import type { Database } from '../types'
import type { SpecStore } from '../types'

interface CatalogServerDeps {
  db: Database
  specStore: SpecStore
  mcpBaseUrl: string
}

export function createCatalogServer(deps: CatalogServerDeps): McpServer {
  const { db, specStore, mcpBaseUrl } = deps
  const service = new ApiService(new ApiRepository(db))
  const resolver = new SpecResolver(db, specStore)

  const server = new McpServer({
    name: 'api2aux-catalog',
    version: '0.1.0',
  })

  // ── search_catalog ──────────────────────────────────────────────────

  server.registerTool(
    'search_catalog',
    {
      description: 'Search the API catalog. Returns matching APIs with metadata. Use facet filters to narrow results.',
      inputSchema: {
        query: z.string().optional().describe('Text search across API names and descriptions'),
        category: z.string().optional().describe('Filter by category (e.g. "Weather", "AI/ML", "Finance")'),
        subcategory: z.string().optional().describe('Filter by subcategory'),
        authType: z.string().optional().describe('Filter by auth type: none, apiKey, Bearer, OAuth2'),
        freeTier: z.string().optional().describe('Filter by free tier: yes, no, freemium'),
        hasSpec: z.boolean().optional().describe('Only return APIs that have an OpenAPI spec'),
        limit: z.number().optional().describe('Max results to return (default 10, max 50)'),
      },
    },
    async (args) => {
      const result = service.search({
        q: args.query,
        category: args.category,
        subcategory: args.subcategory,
        authType: args.authType,
        freeTier: args.freeTier,
        hasSpec: args.hasSpec === true ? 'true' : args.hasSpec === false ? 'false' : undefined,
        limit: Math.min(args.limit ?? 10, 50),
        page: 1,
      })

      const apis = result.items.map(api => ({
        id: api.id,
        name: api.name,
        description: api.description,
        category: api.category,
        subcategory: api.subcategory,
        baseUrl: api.baseUrl,
        authType: api.authType,
        freeTier: api.freeTier,
        hasSpec: api.hasSpec === 1,
        status: api.status,
        mcpUrl: `${mcpBaseUrl}/catalog/${api.id}`,
      }))

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({ total: result.total, count: apis.length, apis }, null, 2),
        }],
      }
    },
  )

  // ── get_api_details ─────────────────────────────────────────────────

  server.registerTool(
    'get_api_details',
    {
      description: 'Get full details for a specific API including parsed operations from its OpenAPI spec. Operations are lazily parsed on first access.',
      inputSchema: {
        id: z.string().describe('API identifier (slug), e.g. "openweathermap"'),
      },
    },
    async (args) => {
      const api = service.getById(args.id)
      if (!api) {
        return {
          content: [{ type: 'text' as const, text: `API "${args.id}" not found` }],
          isError: true,
        }
      }

      // Lazy parse: if spec exists but hasn't been parsed, parse now
      if (api.hasSpec === 1 && api.specParsed === 0) {
        const parseResult = await resolver.resolve(args.id)
        if (parseResult.ok) {
          // Re-fetch with newly parsed operations
          const refreshed = service.getById(args.id)
          if (refreshed) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  ...refreshed,
                  mcpUrl: `${mcpBaseUrl}/catalog/${refreshed.id}`,
                  operationCount: refreshed.operations.length,
                }, null, 2),
              }],
            }
          }
        } else {
          // Parsing failed — return what we have plus the error
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                ...api,
                mcpUrl: `${mcpBaseUrl}/catalog/${api.id}`,
                specParseError: parseResult.error,
              }, null, 2),
            }],
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            ...api,
            mcpUrl: `${mcpBaseUrl}/catalog/${api.id}`,
            operationCount: api.operations.length,
          }, null, 2),
        }],
      }
    },
  )

  return server
}
