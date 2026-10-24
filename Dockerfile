FROM node:24-slim AS build
USER node
WORKDIR /home/node/app
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci
COPY --chown=node:node tsconfig.json tsconfig.build.json ./
COPY --chown=node:node src src
RUN npm run build

FROM build AS deps
RUN npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /home/node/app/node_modules node_modules
COPY package.json ./
COPY --from=build /home/node/app/dist dist
USER 1000:1000
EXPOSE 8080 9464
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
