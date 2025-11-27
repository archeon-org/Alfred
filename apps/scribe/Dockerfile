FROM node:22-alpine AS builder

WORKDIR /app

# Copy root package files
COPY package.json yarn.lock ./

# Copy workspace package files
COPY apps/scribe/package.json apps/scribe/
COPY packages/types/package.json packages/types/
COPY packages/database/package.json packages/database/
COPY packages/module/package.json packages/module/

# Remove postinstall script to prevent premature build
RUN sed -i '/"postinstall":/d' package.json

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY apps/scribe apps/scribe
COPY packages/types packages/types
COPY packages/database packages/database
COPY packages/module packages/module

# Build packages
RUN yarn workspace @archeon-org/types build
RUN yarn workspace @archeon-org/database build
RUN yarn workspace @archeon-org/module build
RUN yarn workspace scribe build

# Production stage
FROM node:22-alpine

# Install Tesseract OCR with English language data, poppler-utils (for PDF to image), and fonts
RUN apk add --no-cache \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    poppler-utils \
    fontconfig \
    ttf-dejavu \
    ttf-liberation \
    font-noto

WORKDIR /app

# Copy node_modules and built artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/scribe/node_modules ./apps/scribe/node_modules
COPY --from=builder /app/apps/scribe/dist ./apps/scribe/dist
COPY --from=builder /app/apps/scribe/package.json ./apps/scribe/
COPY --from=builder /app/apps/scribe/db ./apps/scribe/db
COPY --from=builder /app/apps/scribe/src ./apps/scribe/src
COPY --from=builder /app/apps/scribe/tsconfig.json ./apps/scribe/
COPY --from=builder /app/packages/types/dist ./packages/types/dist
COPY --from=builder /app/packages/types/package.json ./packages/types/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/
COPY --from=builder /app/packages/module/dist ./packages/module/dist
COPY --from=builder /app/packages/module/package.json ./packages/module/

# Set working directory to the app
WORKDIR /app/apps/scribe

# Add root node_modules to PATH
ENV PATH=$PATH:/app/node_modules/.bin

# Expose the port the app runs on
EXPOSE 3000

CMD ["node", "dist/src/main"]
