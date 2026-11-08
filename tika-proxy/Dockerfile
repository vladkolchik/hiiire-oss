FROM node:24-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist/src ./dist/src

EXPOSE 3000

CMD ["npm", "run", "start"]
