FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30.5-alpine
USER root
COPY --from=build --chown=root:root /app/dist /usr/share/nginx/html
COPY deploy/default.conf /etc/nginx/conf.d/default.conf
COPY deploy/25-retain-assets.sh /docker-entrypoint.d/25-retain-assets.sh
RUN mkdir -p /var/cache/enziu-frontend/assets \
    && chown -R 101:101 /var/cache/enziu-frontend \
    && chmod 0755 /docker-entrypoint.d/25-retain-assets.sh
USER 101:101
EXPOSE 8080
