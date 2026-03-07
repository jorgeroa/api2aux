import { CORSError, NetworkError, APIError, ParseError, AuthError } from './errors'
import { useAuthStore } from '../../store/authStore'
import type { Credential } from '../../types/auth'

/**
 * Rewrite absolute URLs through the CORS proxy.
 * In dev: handled by Vite plugin. In prod: handled by the combined Node.js server.
 */
function proxyUrl(url: string): string {
  if (url.startsWith('http')) {
    return `/api-proxy/${encodeURIComponent(url)}`
  }
  return url
}

/**
 * Fetch JSON data from an API URL with typed error handling.
 * Detects CORS, network, HTTP, and parse errors.
 */
export async function fetchAPI(url: string): Promise<unknown> {
  let response: Response

  try {
    response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
      },
    })
  } catch (error) {
    // TypeError: Failed to fetch indicates CORS or network issue
    if (error instanceof TypeError) {
      // Heuristic: if we can't distinguish CORS from network,
      // try a HEAD request to check connectivity
      const isCORS = await detectCORS(url)
      if (isCORS) throw new CORSError(url)
      throw new NetworkError(url)
    }
    throw new NetworkError(url)
  }

  if (!response.ok) {
    throw new APIError(url, response.status, response.statusText)
  }

  try {
    return await response.json()
  } catch {
    throw new ParseError(url)
  }
}

/**
 * Heuristic CORS detection: attempt fetch with no-cors mode.
 * If no-cors succeeds (opaque response), the server exists but blocks CORS.
 * If it also fails, it's likely a network error.
 */
async function detectCORS(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { mode: 'no-cors' })
    // Opaque response = server exists, CORS blocked
    return response.type === 'opaque'
  } catch {
    // Both modes failed = network error
    return false
  }
}

/**
 * Validates HTTP header name format.
 * Must start with a letter and contain only letters, numbers, and hyphens.
 */
function validateHeaderName(name: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)
}

/**
 * Safely parse response body as JSON or text.
 * Returns JSON stringified if parsable, raw text otherwise, empty string on failure.
 */
async function safeParseResponseBody(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return ''

    // Try to parse as JSON
    try {
      const json = JSON.parse(text)
      return JSON.stringify(json)
    } catch {
      // Not JSON, return raw text
      return text
    }
  } catch {
    return ''
  }
}

/**
 * Build authenticated request with credentials injected.
 * Returns modified URL and RequestInit with auth headers/params.
 */
function buildAuthenticatedRequest(url: string, credential: Credential): { url: string; init: RequestInit } {
  const init: RequestInit = {
    mode: 'cors',
    credentials: 'omit',
    headers: {
      'Accept': 'application/json',
    },
  }

  switch (credential.type) {
    case 'bearer': {
      init.headers = {
        ...init.headers,
        'Authorization': `Bearer ${credential.token}`,
      }
      return { url, init }
    }

    case 'basic': {
      const encoded = btoa(`${credential.username}:${credential.password}`)
      init.headers = {
        ...init.headers,
        'Authorization': `Basic ${encoded}`,
      }
      return { url, init }
    }

    case 'apiKey': {
      if (!validateHeaderName(credential.headerName)) {
        throw new Error(`Invalid header name: ${credential.headerName}`)
      }
      init.headers = {
        ...init.headers,
        [credential.headerName]: credential.value,
      }
      return { url, init }
    }

    case 'queryParam': {
      const parsedUrl = new URL(url)
      parsedUrl.searchParams.set(credential.paramName, credential.value)
      return { url: parsedUrl.toString(), init }
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = credential
      return _exhaustive
    }
  }
}

/**
 * Execute fetch with auth error detection.
 * Checks for 401/403 and throws AuthError with context.
 */
async function executeFetch(url: string, init: RequestInit, credential: Credential | null): Promise<unknown> {
  let response: Response

  try {
    response = await fetch(proxyUrl(url), init)
  } catch (error) {
    // TypeError: Failed to fetch indicates CORS or network issue
    if (error instanceof TypeError) {
      const isCORS = await detectCORS(url)
      if (isCORS) throw new CORSError(url)
      throw new NetworkError(url)
    }
    throw new NetworkError(url)
  }

  // Check for auth errors (401/403)
  if (response.status === 401 || response.status === 403) {
    const authContext = credential ? `${credential.type} auth` : 'no credentials configured'
    const responseBody = await safeParseResponseBody(response.clone())
    throw new AuthError(url, response.status, authContext, responseBody)
  }

  // Check for other HTTP errors
  if (!response.ok) {
    throw new APIError(url, response.status, response.statusText)
  }

  // Parse JSON response
  try {
    return await response.json()
  } catch {
    throw new ParseError(url)
  }
}

export interface FetchOptions {
  method?: string   // defaults to 'GET'
  body?: string     // JSON string for request body
}

/**
 * Fetch JSON data from an API URL with authentication support.
 * Automatically injects credentials from auth store if configured.
 * Detects 401/403 as AuthError, CORS, network, HTTP, and parse errors.
 */
export async function fetchWithAuth(url: string, options?: FetchOptions): Promise<unknown> {
  const credential = useAuthStore.getState().getActiveCredential(url)
  const method = options?.method ?? 'GET'
  const body = options?.body

  if (credential) {
    const { url: modifiedUrl, init } = buildAuthenticatedRequest(url, credential)
    init.method = method
    if (body) {
      init.body = body
      init.headers = { ...init.headers as Record<string, string>, 'Content-Type': 'application/json' }
    }
    return executeFetch(modifiedUrl, init, credential)
  } else {
    const init: RequestInit = {
      method,
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Accept': 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
    }
    return executeFetch(url, init, null)
  }
}

/**
 * Check if authentication is configured for a URL.
 * Returns true if an active credential exists for the URL's origin.
 */
export function isAuthConfigured(url: string): boolean {
  const credential = useAuthStore.getState().getActiveCredential(url)
  return credential !== null
}

/**
 * Mask credential values for safe logging.
 * Returns a masked string representation of the credential.
 */
export function maskCredential(credential: Credential): string {
  switch (credential.type) {
    case 'bearer': {
      const preview = credential.token.substring(0, 4)
      return `Bearer ${preview}***`
    }

    case 'basic': {
      return `Basic ${credential.username}:***`
    }

    case 'apiKey': {
      return `${credential.headerName}: ***`
    }

    case 'queryParam': {
      return `?${credential.paramName}=***`
    }

    default: {
      const _exhaustive: never = credential
      return _exhaustive
    }
  }
}
