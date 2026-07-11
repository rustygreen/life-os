FROM node:22-alpine

WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN npm install

EXPOSE 4010

CMD ["npm", "run", "start", "-w", "@life-os/hermes"]
