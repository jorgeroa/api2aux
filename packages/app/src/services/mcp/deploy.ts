/**
 * Deploy an API as a hosted MCP server.
 * Sends pre-parsed operations to the MCP Worker registration endpoint.
 */

import type { ParsedOperation, ParsedSpec } from '@api2aux/semantic-analysis'

const MCP_WORKER_URL = import.meta.env.VITE_MCP_WORKER_URL || 'https://api2aux-mcp.jgt-992.workers.dev'

export interface DeployConfig {
  apiUrl: string
  baseUrl: string
  name: string
  authType: 'bearer' | 'header' | 'apikey' | 'none'
  authParamName?: string
  operations: ParsedOperation[]
}

export interface DeployResult {
  tenantId: string
  mcpUrl: string
  expiresAt: string
}

/**
 * Deploy an API as a hosted MCP server by registering it with the Worker.
 */
export async function deployAsMcpServer(config: DeployConfig): Promise<DeployResult> {
  // OpenAPI specs can have circular $refs after dereferencing.
  // Use a seen-set replacer to safely serialize.
  const seen = new WeakSet()
  const body = JSON.stringify(config, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return undefined
      seen.add(value)
    }
    return value
  })

  const response = await fetch(`${MCP_WORKER_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error((error as { error: string }).error || `Registration failed: ${response.status}`)
  }

  return response.json() as Promise<DeployResult>
}

/**
 * Build a DeployConfig from a parsed OpenAPI spec.
 */
export function buildDeployConfig(spec: ParsedSpec, authType: 'none' | 'bearer' | 'header' | 'apikey' = 'none'): DeployConfig {
  // Derive a short name from the spec title
  const name = spec.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30)

  return {
    apiUrl: spec.baseUrl,
    baseUrl: spec.baseUrl,
    name,
    authType,
    operations: spec.operations,
  }
}
