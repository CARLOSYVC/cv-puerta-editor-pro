FROM node:22-bookworm-slim AS build

WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM build AS migrate
ENV HOME=/home/node
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
