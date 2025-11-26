FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json yarn.lock ./

# Copy workspace package files
COPY apps/scribe/package.json apps/scribe/
COPY packages/types/package.json packages/types/

# Remove postinstall script to prevent premature build
RUN sed -i '/"postinstall":/d' package.json

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY apps/scribe apps/scribe
COPY packages/types packages/types

# Build packages
RUN yarn workspace @archeon-org/types build
RUN yarn workspace scribe build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy node_modules and built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/scribe/node_modules ./apps/scribe/node_modules
COPY --from=builder /app/apps/scribe/dist ./apps/scribe/dist
COPY --from=builder /app/apps/scribe/package.json ./apps/scribe/
COPY --from=builder /app/apps/scribe/tsconfig.json ./apps/scribe/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/

# Set working directory to the app
WORKDIR /app/apps/scribe

# Add root node_modules to PATH
ENV PATH=$PATH:/app/node_modules/.bin

# Expose the port the app runs on
EXPOSE 3000

CMD ["node", "dist/main"]
