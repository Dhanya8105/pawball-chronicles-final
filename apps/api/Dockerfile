# apps/api/Dockerfile — Railway deployment.
#
# Railway sets the service root directory to `apps/api`, but it runs the
# Docker build from the MONOREPO ROOT. So every path in this file is
# relative to the repo root, not apps/api — do not `WORKDIR apps/api` and
# do not reference `../packages`.

FROM node:20-slim
WORKDIR /repo

# 1. Manifests first, so `npm install` is only re-run when a dependency
#    actually changes.
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY apps/api/package.json apps/api/package.json

# 2. Install the workspaces present at this point (apps/api + shared-types)
#    plus the workspace root. devDependencies are needed for the tsc build.
RUN npm install --workspaces --include-workspace-root

# 3. Source. tsconfig.base.json is the base every workspace tsconfig
#    extends — the build fails without it.
COPY tsconfig.base.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

# 4. Compile apps/api -> apps/api/dist. @pawball/shared-types is a
#    types-only package consumed straight from source (its package.json
#    `types` points at src/index.ts), so it needs no build step, and tsc's
#    type-only imports of it are elided from the emitted JS — nothing
#    requires it at runtime.
RUN npm run build --workspace=@pawball/api

EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
