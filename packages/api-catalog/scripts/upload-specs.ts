/**
 * Spec upload script — copies spec files from data/specs/ into the SpecStore
 * and updates the database with spec metadata.
 *
 * Usage: pnpm --filter @api2aux/api-catalog upload-specs
 *
 * In local dev: copies to a spec-cache/ directory via LocalSpecStore.
 * In production: would upload to R2/S3 via the deployed SpecStore implementation.
 */

import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../src/db/schema'
import { apis } from '../src/db/schema'
import { LocalSpecStore } from '../src/stores/local-spec-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = path.resolve(__dirname, '../../../data')
const pkgDir = path.resolve(__dirname, '..')

// ── Load specs index ──────────────────────────────────────────────────

const specsIndexPath = path.join(dataDir, 'specs/index.json')
if (!existsSync(specsIndexPath)) {
  console.error(`Specs index not found: ${specsIndexPath}`)
  process.exit(1)
}

interface SpecEntry {
  file: string
  url: string
  size_bytes: number
  endpoint_count: number
  spec_format: string
  api_version: string
}

const specsData = JSON.parse(readFileSync(specsIndexPath, 'utf-8'))
const specsIndex: Record<string, SpecEntry> = specsData.specs ?? {}
console.log(`Specs index: ${Object.keys(specsIndex).length} entries`)

// ── Database setup ────────────────────────────────────────────────────

const sqlite = new Database(path.resolve(pkgDir, 'dev.db'))
sqlite.pragma('journal_mode = WAL')
const db = drizzle(sqlite, { schema })

migrate(db, { migrationsFolder: path.resolve(pkgDir, 'src/db/migrations') })

// ── Spec store ────────────────────────────────────────────────────────

const specCacheDir = path.resolve(pkgDir, 'spec-cache')
const specStore = new LocalSpecStore(specCacheDir)

// ── Upload specs ──────────────────────────────────────────────────────

let uploaded = 0
let skipped = 0
let notFound = 0

for (const [apiName, entry] of Object.entries(specsIndex)) {
  const specFilePath = path.join(dataDir, 'specs', entry.file)

  if (!existsSync(specFilePath)) {
    console.warn(`  Spec file missing: ${entry.file}`)
    notFound++
    continue
  }

  // Generate the same slug used by ingest-csv.ts
  const slug = apiName
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  // Check if this API exists in the database
  const apiRecord = db.select().from(apis).where(eq(apis.id, slug)).get()
  if (!apiRecord) {
    skipped++
    continue
  }

  // Upload spec to store
  const data = readFileSync(specFilePath)
  const ext = path.extname(entry.file) || '.json'
  const storeKey = `specs/${slug}${ext}`

  await specStore.put(storeKey, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))

  // Update DB
  db.update(apis)
    .set({
      hasSpec: 1,
      specFile: storeKey,
      endpointCount: entry.endpoint_count || 0,
      specFormat: entry.spec_format || undefined,
    })
    .where(eq(apis.id, slug))
    .run()

  uploaded++
}

// ── Summary ───────────────────────────────────────────────────────────

console.log('\n=== Upload Summary ===')
console.log(`Uploaded: ${uploaded}`)
console.log(`Skipped (no matching API in DB): ${skipped}`)
console.log(`Not found on disk: ${notFound}`)
console.log(`Spec cache: ${specCacheDir}`)

sqlite.close()
console.log('\nDone.')
