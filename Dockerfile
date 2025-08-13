FROM node:20-alpine AS base

WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package*.json ./
RUN npm ci --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# Copy migration script to dist
RUN cp src/prisma-migrate.ts dist/ 2>/dev/null || true

FROM base AS runner
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
ENV AUTO_MIGRATE=true
ENV STRICT_MIGRATION=false
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package*.json ./

EXPOSE 5000

ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "npx prisma generate && npx prisma db push --skip-generate --accept-data-loss && npm run start:prod"]