FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Prisma engines need OpenSSL (not included in the slim image).
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @noah/api db:generate && pnpm --filter @noah/api... build
RUN pnpm --filter @noah/api deploy --prod /prod/api
# `pnpm deploy` produces a fresh node_modules without the generated client: generate it
# there so @prisma/client is initialized at runtime. The prisma CLI is a prod dependency so
# the migration job runs offline (no npx download).
RUN cd /prod/api && ./node_modules/.bin/prisma generate --schema=prisma/schema.prisma

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
# The system user has no home directory; give tools a writable HOME.
ENV HOME=/tmp
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs noah
COPY --from=build --chown=noah:nodejs /prod/api ./
COPY --from=build --chown=noah:nodejs /app/apps/api/dist ./dist
USER noah
EXPOSE 8080
CMD ["node", "dist/main.js"]
