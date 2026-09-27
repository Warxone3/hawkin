FROM node:24-alpine AS build

RUN apk add --no-cache git
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY assets ./assets
RUN npm run build

FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/assets ./assets
RUN mkdir -p /app/auth_info_baileys /app/downloads \
    && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/index.js"]