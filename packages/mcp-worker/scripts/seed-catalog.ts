/**
 * Seed catalog APIs into the MCP worker.
 * Run with: npx tsx scripts/seed-catalog.ts
 *
 * This script builds TenantConfig objects for each catalog API
 * and registers them via the worker's HTTP API.
 */

interface SeedOperation {
  path: string
  method: string
  id: string
  summary?: string
  description?: string
  parameters: Array<{
    name: string
    in: 'query' | 'path' | 'header' | 'cookie'
    required: boolean
    description: string
    schema: { type: string; format?: string; enum?: unknown[]; default?: unknown; example?: unknown; minimum?: number; maximum?: number; maxLength?: number }
  }>
  requestBody?: unknown
  responseSchema?: unknown
  tags: string[]
}

interface TenantConfig {
  apiUrl: string
  baseUrl: string
  name: string
  authType: 'none'
  operations: SeedOperation[]
  createdAt: string
  expiresAt: string
}

// ── Catalog API definitions ──────────────────────────────────────────

const CATALOG: Array<{ name: string; baseUrl: string; operations: SeedOperation[] }> = [
  {
    name: 'jsonplaceholder',
    baseUrl: 'https://jsonplaceholder.typicode.com',
    operations: [
      {
        path: '/users', method: 'GET', id: 'getUsers',
        summary: 'Get all users', parameters: [], responseSchema: null, tags: ['users'],
      },
      {
        path: '/users/{id}', method: 'GET', id: 'getUserById',
        summary: 'Get user by ID',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'User ID', schema: { type: 'integer' } }],
        responseSchema: null, tags: ['users'],
      },
      {
        path: '/posts', method: 'GET', id: 'getPosts',
        summary: 'Get all posts',
        parameters: [{ name: 'userId', in: 'query', required: false, description: 'Filter by user ID', schema: { type: 'integer' } }],
        responseSchema: null, tags: ['posts'],
      },
      {
        path: '/posts/{id}', method: 'GET', id: 'getPostById',
        summary: 'Get post by ID',
        parameters: [{ name: 'id', in: 'path', required: true, description: 'Post ID', schema: { type: 'integer' } }],
        responseSchema: null, tags: ['posts'],
      },
      {
        path: '/posts/{postId}/comments', method: 'GET', id: 'getPostComments',
        summary: 'Get comments for a post',
        parameters: [{ name: 'postId', in: 'path', required: true, description: 'Post ID', schema: { type: 'integer' } }],
        responseSchema: null, tags: ['comments'],
      },
      {
        path: '/todos', method: 'GET', id: 'getTodos',
        summary: 'Get all todos',
        parameters: [{ name: 'userId', in: 'query', required: false, description: 'Filter by user ID', schema: { type: 'integer' } }],
        responseSchema: null, tags: ['todos'],
      },
    ],
  },
  {
    name: 'catfact',
    baseUrl: 'https://catfact.ninja',
    operations: [
      {
        path: '/fact', method: 'GET', id: 'getRandomFact',
        summary: 'Get a random cat fact', parameters: [], responseSchema: null, tags: ['facts'],
      },
      {
        path: '/facts', method: 'GET', id: 'getFacts',
        summary: 'Get a list of cat facts',
        parameters: [
          { name: 'limit', in: 'query', required: false, description: 'Number of facts', schema: { type: 'integer', default: 10 } },
          { name: 'page', in: 'query', required: false, description: 'Page number', schema: { type: 'integer' } },
        ],
        responseSchema: null, tags: ['facts'],
      },
    ],
  },
  {
    name: 'dogceo',
    baseUrl: 'https://dog.ceo/api',
    operations: [
      {
        path: '/breeds/list/all', method: 'GET', id: 'listAllBreeds',
        summary: 'List all dog breeds', parameters: [], responseSchema: null, tags: ['breeds'],
      },
      {
        path: '/breeds/image/random', method: 'GET', id: 'getRandomImage',
        summary: 'Get a random dog image', parameters: [], responseSchema: null, tags: ['images'],
      },
      {
        path: '/breed/{breed}/images/random', method: 'GET', id: 'getBreedImage',
        summary: 'Get a random image of a specific breed',
        parameters: [{ name: 'breed', in: 'path', required: true, description: 'Dog breed name (e.g., "labrador")', schema: { type: 'string' } }],
        responseSchema: null, tags: ['images'],
      },
    ],
  },
]

// ── Seed logic ───────────────────────────────────────────────────────

const WORKER_URL = process.env.MCP_WORKER_URL || 'http://localhost:8787'

async function seed() {
  for (const api of CATALOG) {
    console.log(`Seeding ${api.name} (${api.operations.length} operations)...`)

    const response = await fetch(`${WORKER_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiUrl: api.baseUrl,
        baseUrl: api.baseUrl,
        name: api.name,
        authType: 'none',
        operations: api.operations,
      }),
    })

    if (!response.ok) {
      console.error(`Failed to seed ${api.name}: ${response.status}`)
      continue
    }

    const result = await response.json()
    console.log(`  → Registered as ${(result as { tenantId: string }).tenantId}`)
  }

  console.log(`\nSeeded ${CATALOG.length} catalog APIs.`)
}

seed().catch(console.error)
