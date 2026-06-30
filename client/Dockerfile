# Cocoon frontend — Cloud Run deployment image
# Multi-stage: build the Vite app, then serve the static output with nginx.

# ── Build stage ──
FROM node:20-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# VITE_API_URL must be passed as a build arg since Vite inlines env vars
# at build time, not runtime. Pass it via --build-arg when building the image.
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

RUN npm run build

# ── Serve stage ──
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run injects PORT; nginx.conf is templated to read it at container start
ENV PORT=8080
EXPOSE 8080

CMD ["/bin/sh", "-c", "sed -i \"s/listen 8080/listen $PORT/\" /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
