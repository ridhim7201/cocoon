# Cocoon backend — Cloud Run deployment image
FROM node:20-slim

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY server.js ./

# Cloud Run sets PORT automatically; the app reads process.env.PORT
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
