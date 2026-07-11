FROM node:22-alpine AS build

WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm install
RUN npm run build -w @life-os/web

FROM nginx:1.27-alpine

COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
