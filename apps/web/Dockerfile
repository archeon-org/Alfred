FROM node:22.23.2-alpine3.23@sha256:46825fbbd4e996a78b7a2cdc08d75e38a5a505bdab95dcda55605359bf124bc6 AS tooling

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HUSKY=0

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM tooling AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

RUN --mount=type=cache,id=alfred-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @alfred/web...

FROM dependencies AS development

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/web/tsconfig*.json apps/web/vite.config.ts apps/web/index.html ./apps/web/
COPY apps/web/src ./apps/web/src
COPY apps/web/public ./apps/web/public
COPY packages/contracts ./packages/contracts

WORKDIR /workspace/apps/web

USER node

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["node", "node_modules/vite/bin/vite.js", "--host", "0.0.0.0", "--port", "8080"]

FROM dependencies AS build

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter @alfred/contracts build \
    && pnpm --filter @alfred/web build

FROM nginxinc/nginx-unprivileged:1.31.4-alpine@sha256:901e944d1f4fc2bd077e8f5568b98c1f6f8cdacf6b97a87747c43134a339b9a7 AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
