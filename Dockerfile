FROM node:18

WORKDIR /app

COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

COPY . .
RUN apt-get update && apt-get install -y postgresql-client
RUN npm install
RUN npm run build
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

CMD ["sh", "./entrypoint.sh"]

# CMD ["node", "dist/index.js"]