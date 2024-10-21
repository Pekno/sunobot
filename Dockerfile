FROM node:latest
WORKDIR /usr/src/app
RUN apt-get update && apt-get install -y ffmpeg
COPY package*.json ./
RUN npm install
COPY ./dist .
COPY ./dist/env ./env
CMD [ "node", "./main/main.js" ]