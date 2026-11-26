# syntax=docker/dockerfile:1
# Mecánico Virtual Motolab AA — standalone
# Build: docker build -t mecanico-virtual .
# Run:  docker run -p 3000:3000 --env-file .env mecanico-virtual
# (DATABASE_URL es obligatorio; sin ANTHROPIC_API_KEY arranca en modo STUB)

FROM node:24 AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY server/ ./server/
COPY client/ ./client/
RUN cd client && npm run build
RUN cd server && npm run build

FROM node:24-slim AS runtime
WORKDIR /app/server
ENV NODE_ENV=production
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/client /app/client
EXPOSE 3000
CMD ["node", "dist/server.js"]
