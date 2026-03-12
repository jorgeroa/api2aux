#!/usr/bin/env node

/**
 * CLI entry point for the api2aux MCP server.
 *
 * Usage:
 *   api2aux-mcp --openapi https://petstore.swagger.io/v2/swagger.json
 *   api2aux-mcp --api https://jsonplaceholder.typicode.com
 *   api2aux-mcp --openapi URL --token YOUR_TOKEN
 *   api2aux-mcp export --api URL --name my-api
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server'
import { generateClaudeDesktopConfig, generateClaudeCodeConfig, detectLocalCliPath } from './config-generator'
import type { ServerConfig } from './types'

interface CliOptions extends ServerConfig {
  command?: 'serve' | 'export'
  exportFormat?: 'claude-desktop' | 'claude-code'
}

function parseArgs(argv: string[]): CliOptions {
  const config: CliOptions = {}
  let i = 2 // Skip node and script path

  // Check for subcommand
  if (argv[2] === 'export') {
    config.command = 'export'
    i = 3
  }

  while (i < argv.length) {
    const arg = argv[i]
    const next = argv[i + 1]

    switch (arg) {
      case '--openapi':
        config.openapiUrl = next
        i += 2
        break
      case '--api':
        config.apiUrl = next
        i += 2
        break
      case '--name':
        config.name = next
        i += 2
        break
      case '--token':
        config.token = next
        i += 2
        break
      case '--header':
        config.header = next
        i += 2
        break
      case '--api-key':
        config.apiKey = next
        i += 2
        break
      case '--cookie':
        config.cookie = next
        i += 2
        break
      case '--debug':
        config.debug = true
        i++
        break
      case '--full-response':
        config.fullResponse = true
        i++
        break
      case '--format':
        config.exportFormat = next as CliOptions['exportFormat']
        i += 2
        break
      case '--help':
      case '-h':
        printHelp()
        process.exit(0)
        break
      case '--':
        i++
        break
      default:
        // Skip unknown args silently (node may inject extra args)
        i++
        break
    }
  }

  return config
}

function printHelp(): void {
  console.error(`
api2aux-mcp — Turn any API into MCP tools

Usage:
  api2aux-mcp --openapi <url>             Start MCP server from OpenAPI spec
  api2aux-mcp --api <url>                 Start MCP server for raw API URL
  api2aux-mcp export --openapi <url>      Generate client config snippet

Options:
  --openapi <url>     OpenAPI/Swagger spec URL
  --api <url>         Raw API base URL
  --name <name>       Server name (default: api2aux-mcp)
  --token <token>     Bearer token for API authentication
  --header <h:v>      Custom header (e.g., "X-API-Key: secret")
  --api-key <k=v>     API key as query param (e.g., "apiKey=secret")
  --cookie <n=v>      Cookie auth (e.g., "session=abc123")
  --debug             Show request URL, headers, and timing in responses
  --full-response     Disable auto-truncation of large responses
  --format <fmt>      Export format: claude-desktop (default), claude-code
  -h, --help          Show this help

Examples:
  api2aux-mcp --openapi https://petstore.swagger.io/v2/swagger.json
  api2aux-mcp --api https://jsonplaceholder.typicode.com --name jsonplaceholder
  api2aux-mcp export --openapi https://api.example.com/openapi.json --name my-api
  api2aux-mcp export --api https://example.com/api --format claude-code
`)
}

function handleExport(config: CliOptions): void {
  if (!config.openapiUrl && !config.apiUrl) {
    console.error('Error: Either --openapi or --api must be specified\n')
    process.exit(1)
  }

  const format = config.exportFormat || 'claude-desktop'
  const localPath = detectLocalCliPath()

  const result = format === 'claude-code'
    ? generateClaudeCodeConfig(config, localPath ?? undefined)
    : generateClaudeDesktopConfig(config, localPath ?? undefined)

  console.log(result.instructions)
}

async function handleServe(config: CliOptions): Promise<void> {
  if (!config.openapiUrl && !config.apiUrl) {
    console.error('Error: Either --openapi or --api must be specified\n')
    printHelp()
    process.exit(1)
  }

  try {
    const server = await createServer(config)
    const transport = new StdioServerTransport()
    await server.connect(transport)
    console.error('[api2aux-mcp] Server running on stdio')
  } catch (err) {
    console.error(`[api2aux-mcp] Fatal: ${err instanceof Error ? err.message : String(err)}`)
    process.exit(1)
  }
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv)

  if (config.command === 'export') {
    handleExport(config)
  } else {
    await handleServe(config)
  }
}

main()
