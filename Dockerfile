# Two stages, like a Go multi-stage build: compile with the full toolchain, then copy only what runs.
# Build for the Pi:  docker buildx build --platform linux/arm64 -t ghcr.io/harrisonwaffel/poker-tracker --push .

FROM node:22-bookworm-slim AS build
WORKDIR /app
# npm 10 (bundled with Node 22) crashes resolving this dependency tree; see README.
RUN npm install -g npm@11
COPY package.json package-lock.json .npmrc ./
# --ignore-scripts: otherwise npm compiles better-sqlite3 from source (needs Python and a C++ toolchain),
# though it already ships prebuilt binaries for every platform we run on.
RUN npm ci --ignore-scripts
COPY . .
# `vite build` runs the server code once to analyse it, which opens the database. Point it at a
# throwaway file that stays in this stage. Then drop devDependencies (the bundle already includes them).
RUN DATABASE_URL=/tmp/build.db npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	DATABASE_URL=/data/poker.db
# node_modules is only better-sqlite3 now; it ships prebuilt linux-arm64 binaries, so nothing compiles.
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
# SQL migrations, applied by the app on startup.
COPY --from=build /app/drizzle ./drizzle
RUN mkdir /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
