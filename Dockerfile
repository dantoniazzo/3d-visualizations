# The walkthrough server is a long-lived process, not a set of functions: it
# holds Socket.IO connections and runs a 50 Hz presence tick. Any container
# host will do — Railway, Render, Fly.io.
FROM node:22-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# VITE_ vars are baked in at build time, so the CDN origin for models has to
# be supplied here rather than at runtime.
ARG VITE_MODEL_BASE=""
ENV VITE_MODEL_BASE=$VITE_MODEL_BASE
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts
COPY scenes ./scenes

EXPOSE 3000
CMD ["node", "server/index.js"]
