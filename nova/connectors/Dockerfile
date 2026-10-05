FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
RUN addgroup -S connectors && adduser -S connectors -G connectors
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
USER connectors
CMD ["node", "--import", "tsx", "src/index.ts"]
