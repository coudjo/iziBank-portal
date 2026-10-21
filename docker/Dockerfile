FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Production build: no mock API (start.prod.ts), mocks off in config.json; check-bundle enforces both and the budget.
RUN npm run build && npm run check:bundle

FROM nginxinc/nginx-unprivileged:stable-alpine
COPY docker/security-headers.inc /etc/nginx/snippets/security-headers.inc
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/iziBank-portal/browser /usr/share/nginx/html
# config.json ships with "useMocks": false. Mount a replacement to change the API URL or session timings.
