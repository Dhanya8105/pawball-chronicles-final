FROM node:20-slim AS base
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json

RUN npm install --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web

RUN npm run build --workspace=packages/shared-types
RUN npm run build --workspace=apps/web

WORKDIR /repo/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
