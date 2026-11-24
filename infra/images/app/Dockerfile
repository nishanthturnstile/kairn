FROM node:24.22.3-bookworm-slim@sha256:dc26ae92c9fb15cf6b1d63e20f0944b2efe0f115b20e00be48fb23fceb061c54 AS base

FROM base AS build
WORKDIR /build
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable pnpm
COPY . .
RUN pnpm install --frozen-lockfile

FROM build AS ops
USER node

FROM build AS server-build
RUN pnpm exec vp run --filter '@kairn/server...' build \
    && pnpm --filter @kairn/server deploy --prod /deploy

FROM build AS worker-build
RUN pnpm exec vp run --filter '@kairn/worker...' build \
    && pnpm --filter @kairn/worker deploy --prod /deploy

FROM build AS web-build
ARG VITE_GPX_JOURNEY_CREATE=0
ARG VITE_MAPBOX_PUBLIC_TOKEN
RUN pnpm exec vp run --filter '@kairn/web...' build

FROM base AS server
ENV NODE_ENV=production HOST=0.0.0.0 READER_BUILD_DIR=/app/reader
WORKDIR /app
COPY --chown=node:node --from=server-build /deploy/ ./
COPY --chown=node:node --from=web-build /build/apps/web/dist/server/ ./reader/server/
COPY --chown=node:node --from=web-build /build/apps/web/dist/client/.vite/manifest.json ./reader/client/.vite/manifest.json
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

FROM base AS worker
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ffmpeg=7:5.1.9-0+deb12u1 \
       libheif-examples=1.15.1-1+deb12u1 \
       libimage-exiftool-perl=12.57+dfsg-1 \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=worker-build /deploy/ ./
USER node
CMD ["node", "dist/index.js"]

FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0 AS edge
COPY --from=web-build /build/apps/web/dist/client/ /srv/
COPY infra/images/app/Caddyfile /etc/caddy/Caddyfile
EXPOSE 8080
