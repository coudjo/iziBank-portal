FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/iziBank-portal/browser /usr/share/nginx/html
# Production: set "useMocks": false in /usr/share/nginx/html/config.json (mount or replace).
