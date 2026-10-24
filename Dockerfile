FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src src
RUN npm run build

FROM build AS deps
RUN npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY --from=build /app/dist dist
USER 1000:1000
EXPOSE 8080 9464
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
