# Build context is server/ (this file's directory) — the same subtree
# pushed to the Amvera remote — so `web/` needs to live under here too.

FROM oven/bun:1 AS web-build
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web ./
RUN bun run build

FROM rust:1.96-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -r -s /usr/sbin/nologin atlas
COPY --from=build /app/target/release/atlas-server /usr/local/bin/atlas-server
# Trailing slashes are deliberate: they change the COPY command string, which
# busts Kaniko's layer cache for this step — otherwise it can keep serving a
# stale web-dist captured the first time this layer ever ran.
COPY --from=web-build /app/web/dist/ /app/web-dist/
RUN chown -R atlas:atlas /app/web-dist
ENV STATIC_DIR=/app/web-dist
USER atlas
EXPOSE 8080
ENTRYPOINT ["atlas-server"]
