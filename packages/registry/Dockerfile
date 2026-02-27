FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4003

CMD ["npx", "tsx", "bin/start.ts"]
