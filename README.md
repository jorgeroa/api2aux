# api2aux

Paste an API URL. See it. Chat it. Share it with agents.

Three ways to experience any API: **smart rendering** with semantic field detection, **AI chat** to converse with endpoints in natural language, and **MCP export** to turn any API into tools for Claude Desktop, Claude Code, and other AI agents.

## Quick Start

### Development

```bash
pnpm install
pnpm link ../../../api-invoke   # use local api-invoke source (re-run after pnpm install)
pnpm dev
```

Open http://localhost:5173 and paste any JSON API URL, or try a built-in example.

### Docker (self-hosting)

```bash
docker compose up
```

This runs a combined server on http://localhost:8787 with the app, MCP worker, and CORS proxy.

### Environment Variables

Copy `.env.example` and adjust as needed:

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_MCP_WORKER_URL` | MCP worker URL for hosted deployments | _(empty — disables hosted tab)_ |
| `PORT` | Server port (Docker / Node adapter) | `8787` |

## Packages

| Package | Description |
|---------|-------------|
| `packages/app` | React web app (Vite) |
| `packages/mcp-server` | Standalone MCP server CLI — turns any API into tools for Claude Desktop, Cursor, etc. |
| `packages/mcp-worker` | Hosted multi-tenant MCP server (Node.js) |
| `packages/semantic-analysis` | OpenAPI parser and semantic field classification |
| `packages/tool-utils` | Shared tool name/description generation |

## Features

### Semantic Field Detection
Fields are automatically classified using an embedding-based engine with 21 semantic categories (price, email, phone, rating, image, status, etc.) across 5 languages (EN/ES/FR/DE/PT). Prices get currency formatting, emails become clickable links, images render inline, and ratings display as stars.

### OpenAPI/Swagger Support
Paste a spec URL to browse tagged endpoints in a sidebar, fill in parameters with auto-generated forms, and execute operations. Supports OpenAPI 2.0 and 3.x.

### AI Chat
Converse with API endpoints in natural language. The chat system generates tool calls from your questions and displays results with semantic rendering.

### MCP Export
Export any API as MCP tools — download a config for Claude Desktop, copy a CLI command for Claude Code, or deploy as a hosted MCP server.

### Component Switching
Switch between table, card list, and list views. The system auto-selects the best component based on data shape, but you can override per-field.

### Authentication
Bearer token, Basic Auth, API Key (header/query), and query parameter authentication. Credentials are stored in sessionStorage (per-tab, not shared).

### Shareable Links
Click "Share" to copy a URL that encodes the API endpoint and view configuration.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start app dev server |
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests |
| `pnpm -r test:run` | Run tests (CI mode) |

## Tech Stack

- **React 19** + TypeScript
- **Vite** for dev server and builds
- **Hono** for the Node.js server and MCP worker
- **Zustand** for state management
- **Tailwind CSS 4** for styling
- **@modelcontextprotocol/sdk** for MCP protocol support

## License

AGPL-3.0 — see [LICENSE](LICENSE).
