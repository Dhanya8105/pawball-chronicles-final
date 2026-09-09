FROM node:20-slim AS base
WORKDIR /repo

# Workspace-aware install: copy only manifests first for layer caching
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm install --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=apps/api

WORKDIR /repo/apps/api
EXPOSE 4000
CMD ["node", "dist/index.js"]
