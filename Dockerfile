FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/app/package.json packages/app/
COPY packages/mcp-worker/package.json packages/mcp-worker/
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/semantic-analysis/package.json packages/semantic-analysis/
COPY packages/tool-utils/package.json packages/tool-utils/
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm -r build

# Production image
FROM node:20-slim AS production
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY --from=base /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=base /app/packages/mcp-worker/package.json packages/mcp-worker/
COPY --from=base /app/packages/tool-utils/package.json packages/tool-utils/
RUN pnpm install --frozen-lockfile --prod

COPY --from=base /app/packages/mcp-worker/dist packages/mcp-worker/dist/
COPY --from=base /app/packages/app/dist packages/app/dist/
COPY --from=base /app/packages/tool-utils/dist packages/tool-utils/dist/

EXPOSE 8787
CMD ["node", "packages/mcp-worker/dist/node.js"]
