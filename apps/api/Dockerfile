FROM node:22.23.2-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6 AS tooling

ENV HUSKY=0 \
    PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM tooling AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN --mount=type=cache,id=alfred-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @alfred/api...

FROM dependencies AS build

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts

RUN pnpm --filter @alfred/contracts build \
    && pnpm --filter @alfred/api build

FROM tooling AS production-dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN --mount=type=cache,id=alfred-pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --ignore-scripts --filter @alfred/api...

FROM node:22.23.2-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6 AS runtime

ENV API_HOST=0.0.0.0 \
    API_PORT=3000 \
    NODE_ENV=production

WORKDIR /app/apps/api

RUN apk upgrade --no-cache \
    && addgroup --system --gid 10001 alfred \
    && adduser --system --uid 10001 --ingroup alfred alfred

# Runtime starts compiled JavaScript directly; keep application dependencies below,
# but remove the base image's package managers and their bundled dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-v* \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg

COPY --from=production-dependencies --chown=alfred:alfred /workspace/node_modules /app/node_modules
COPY --from=production-dependencies --chown=alfred:alfred /workspace/apps/api/package.json ./package.json
COPY --from=production-dependencies --chown=alfred:alfred /workspace/apps/api/node_modules ./node_modules
COPY --from=production-dependencies --chown=alfred:alfred /workspace/packages/contracts/node_modules /app/packages/contracts/node_modules
COPY --from=build --chown=alfred:alfred /workspace/packages/contracts/package.json /app/packages/contracts/package.json
COPY --from=build --chown=alfred:alfred /workspace/packages/contracts/dist /app/packages/contracts/dist
COPY --from=build --chown=alfred:alfred /workspace/apps/api/dist ./dist

USER alfred

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/health/live || exit 1

CMD ["node", "dist/main.js"]
