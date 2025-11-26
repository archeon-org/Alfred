FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json yarn.lock ./

# Copy workspace package files
COPY apps/gate/package.json apps/gate/
COPY packages/types/package.json packages/types/

# Remove postinstall script to prevent premature build
RUN sed -i '/"postinstall":/d' package.json

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY apps/gate apps/gate
COPY packages/types packages/types

# Build packages
RUN yarn workspace @archeon-org/types build
RUN yarn workspace gate build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy node_modules and built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/gate/node_modules ./apps/gate/node_modules
COPY --from=builder /app/apps/gate/dist ./apps/gate/dist
COPY --from=builder /app/apps/gate/package.json ./apps/gate/
COPY --from=builder /app/apps/gate/db ./apps/gate/db
COPY --from=builder /app/apps/gate/src ./apps/gate/src
COPY --from=builder /app/apps/gate/tsconfig.json ./apps/gate/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/

# Set working directory to the app
WORKDIR /app/apps/gate

# Add root node_modules to PATH
ENV PATH=$PATH:/app/node_modules/.bin

# Expose the port the app runs on (default NestJS is often 3000)
EXPOSE 3000

CMD ["sh", "-c", "yarn migration:run && node dist/src/main"]
