FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @noah/api db:generate && pnpm --filter @noah/api... build
RUN pnpm --filter @noah/api deploy --prod /prod/api

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 noah
COPY --from=build --chown=noah:nodejs /prod/api ./
COPY --from=build --chown=noah:nodejs /app/apps/api/dist ./dist
COPY --from=build --chown=noah:nodejs /app/apps/api/prisma ./prisma
USER noah
EXPOSE 8080
CMD ["node", "dist/main.js"]
