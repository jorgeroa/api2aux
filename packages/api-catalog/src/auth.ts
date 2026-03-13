/**
 * better-auth configuration.
 * Sets up GitHub + Google OAuth with Drizzle SQLite adapter.
 */

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from './types'
import * as authSchema from './db/auth-schema'

export function createAuth(db: Database) {
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: authSchema,
    }),
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:8788',
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
      },
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      },
    },
    trustedOrigins: (process.env.TRUSTED_ORIGINS || 'http://localhost:3000').split(','),
  })
}

export type Auth = ReturnType<typeof createAuth>
