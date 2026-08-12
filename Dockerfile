# Runtime image for the `doki` CLI.
# Build context must be a portable deploy directory (see scripts/pack-doki-portable.mjs).
#
#   node scripts/pack-doki-portable.mjs --out portable
#   docker build -f Dockerfile -t doki:local portable

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY . /app/

RUN chmod +x /app/bin/doki.mjs \
  && ln -sf /app/bin/doki.mjs /usr/local/bin/doki

ENTRYPOINT ["doki"]
CMD ["--help"]
