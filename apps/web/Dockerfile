# syntax=docker/dockerfile:1.7

FROM node:22.23.2-alpine3.23 AS tooling

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV HUSKY=0

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

FROM tooling AS dependencies

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json

RUN --mount=type=cache,id=alfred-pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @alfred/web...

FROM dependencies AS build

COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/web ./apps/web

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN pnpm --filter @alfred/web build

FROM nginxinc/nginx-unprivileged:1.31.4-alpine AS runtime

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
