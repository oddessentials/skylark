FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json ./web/
RUN npm ci --ignore-scripts
COPY web ./web
RUN npm run build -w web && npm ci --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
RUN apk add --no-cache postgresql18-client curl su-exec && adduser -D -u 1001 app
WORKDIR /app
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/web/build ./web/build
COPY --chown=app:app package.json ./
COPY --chown=app:app web/package.json web/docker-entrypoint.sh ./web/
COPY --chown=app:app web/drizzle ./web/drizzle
COPY --chown=app:app web/src/lib/server/db/migrate.ts ./web/src/lib/server/db/migrate.ts
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV PROTOCOL_HEADER=x-forwarded-proto
ENV HOST_HEADER=x-forwarded-host
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD curl -fsS http://localhost:3000/api/v1/health || exit 1
WORKDIR /app/web
ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
