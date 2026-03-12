/**
 * Executes API calls for MCP tool invocations.
 * Delegates to api-invoke with throwOnHttpError: false so error
 * responses are returned as data (needed for MCP tools to show
 * error details to the LLM).
 */

import { executeOperation } from 'api-invoke'
import type { Operation, Auth, ExecutionResult } from 'api-invoke'

export type { ExecutionResult }

export async function executeTool(
  baseUrl: string,
  operation: Operation,
  args: Record<string, unknown>,
  auth?: Auth
): Promise<ExecutionResult> {
  return executeOperation(baseUrl, operation, args, { auth, throwOnHttpError: false, timeoutMs: 30000 })
}
