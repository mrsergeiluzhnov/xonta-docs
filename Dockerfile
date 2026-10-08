FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY data ./data
COPY assets ./assets
COPY scripts ./scripts
USER node
EXPOSE 4031
CMD ["node", "src/server.js"]
