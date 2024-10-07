FROM node:22
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY ./dist .
CMD [ "node", "./main/main.js" ]