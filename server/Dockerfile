FROM rust:1.96-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
COPY migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN useradd -r -s /usr/sbin/nologin atlas
COPY --from=build /app/target/release/atlas-server /usr/local/bin/atlas-server
USER atlas
EXPOSE 8080
ENTRYPOINT ["atlas-server"]
