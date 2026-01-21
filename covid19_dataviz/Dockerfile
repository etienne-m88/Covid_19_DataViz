# Base
FROM node:20-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Build
FROM deps AS builder
COPY . .
RUN npx prisma generate
RUN npm run build

# Runtime
FROM node:20-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
WORKDIR /app

# user non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -G nodejs

# Copy only what is needed at runtime
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/covid_19_daily_reports ./covid_19_daily_reports
COPY --from=builder /app/country_population ./country_population

USER nextjs

# Apply DB migrations at startup before running the app.
# If the DB isn't reachable yet (or already up-to-date), continue to start the app.
CMD ["sh", "-c", "npx prisma migrate deploy || echo \"Prisma migrate skipped (DB unavailable or already up-to-date)\" && npm run start"]
