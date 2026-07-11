FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm install

EXPOSE 4000

CMD ["sh", "-c", "npm run db:migrate && npm run start -w @life-os/api"]
