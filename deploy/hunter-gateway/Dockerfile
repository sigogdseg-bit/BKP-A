FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src

ENV PORTA_TCP=7002
ENV PORTA_HTTP=8080

EXPOSE 7002 8080

CMD ["npm", "start"]
