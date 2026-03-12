/**
 * Generates MCP client configuration snippets for Claude Desktop, Cursor, etc.
 */

import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import type { ServerConfig } from './types'

/**
 * Detect if running from a local checkout (not installed via npm).
 * Returns the absolute path to cli.js if local, or null if installed.
 */
export function detectLocalCliPath(): string | null {
  try {
    // Resolve from this module's location
    const thisDir = dirname(fileURLToPath(import.meta.url))
    const cliPath = resolve(thisDir, 'cli.js')
    // If we're inside a packages/mcp-server directory, we're local
    if (thisDir.includes('packages/mcp-server') || thisDir.includes('packages\\mcp-server')) {
      return cliPath
    }
    return null
  } catch {
    return null
  }
}

export interface MCPClientConfig {
  /** JSON object to add to the MCP client config */
  config: Record<string, unknown>
  /** Human-readable instructions */
  instructions: string
}

/**
 * Quote args that contain shell-special characters.
 */
function shellQuoteArgs(args: string[]): string {
  return args.map(a => /[&|;<>()$`\\ "'\t\n]/.test(a) ? `"${a}"` : a).join(' ')
}

/**
 * Build the CLI args array from a server config.
 */
function buildArgs(config: ServerConfig): string[] {
  const args: string[] = []

  if (config.openapiUrl) {
    args.push('--openapi', config.openapiUrl)
  } else if (config.graphqlUrl) {
    args.push('--graphql', config.graphqlUrl)
  } else if (config.apiUrl) {
    args.push('--api', config.apiUrl)
  }

  if (config.name) {
    args.push('--name', config.name)
  }

  if (config.token) {
    args.push('--token', config.token)
  }

  if (config.header) {
    args.push('--header', config.header)
  }

  if (config.apiKey) {
    args.push('--api-key', config.apiKey)
  }

  if (config.cookie) {
    args.push('--cookie', config.cookie)
  }

  return args
}

/**
 * Build the command + args for the MCP server.
 * Uses node + local path when running from source, npx when installed.
 */
function buildCommand(localCliPath?: string): { command: string; prefix: string[] } {
  if (localCliPath) {
    return { command: 'node', prefix: [localCliPath] }
  }
  return { command: 'npx', prefix: ['@api2aux/mcp-server'] }
}

/**
 * Generate a Claude Desktop configuration snippet.
 */
export function generateClaudeDesktopConfig(config: ServerConfig, localCliPath?: string): MCPClientConfig {
  const serverName = config.name || 'api2aux'
  const args = buildArgs(config)
  const { command, prefix } = buildCommand(localCliPath)

  const mcpConfig = {
    [serverName]: {
      command,
      args: [...prefix, ...args],
    },
  }

  const configJson = JSON.stringify(mcpConfig, null, 2)

  return {
    config: mcpConfig,
    instructions: [
      `Add this to your Claude Desktop config file:`,
      ``,
      `macOS: ~/Library/Application Support/Claude/claude_desktop_config.json`,
      `Windows: %APPDATA%\\Claude\\claude_desktop_config.json`,
      ``,
      `Add to the "mcpServers" section:`,
      ``,
      configJson,
      ``,
      `Then restart Claude Desktop.`,
    ].join('\n'),
  }
}

/**
 * Generate a Claude Code (CLI) configuration snippet.
 */
export function generateClaudeCodeConfig(config: ServerConfig, localCliPath?: string): MCPClientConfig {
  const serverName = config.name || 'api2aux'
  const args = buildArgs(config)
  const { command, prefix } = buildCommand(localCliPath)

  const mcpConfig = {
    [serverName]: {
      command,
      args: [...prefix, ...args],
    },
  }

  const configJson = JSON.stringify(mcpConfig, null, 2)
  const cliCommand = `claude mcp add ${serverName} -- ${command} ${shellQuoteArgs([...prefix, ...args])}`

  return {
    config: mcpConfig,
    instructions: [
      `Add this to your Claude Code settings (~/.claude.json or project .claude/settings.json):`,
      ``,
      `Add to the "mcpServers" section:`,
      ``,
      configJson,
      ``,
      `Or use the CLI: ${cliCommand}`,
    ].join('\n'),
  }
}

/**
 * Generate a generic MCP client config (works with any stdio client).
 */
export function generateGenericConfig(config: ServerConfig, localCliPath?: string): MCPClientConfig {
  const args = buildArgs(config)
  const { command, prefix } = buildCommand(localCliPath)

  return {
    config: {
      command,
      args: [...prefix, ...args],
    },
    instructions: [
      `Run the MCP server:`,
      ``,
      `  ${command} ${shellQuoteArgs([...prefix, ...args])}`,
      ``,
      `The server communicates over stdio using the MCP protocol.`,
    ].join('\n'),
  }
}
