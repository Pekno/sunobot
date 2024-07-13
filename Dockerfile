FROM node:22
ENV DISCORD_ID=$DISCORD_ID
ENV DISCORD_TOKEN=$DISCORD_TOKEN
ENV GOOGLE_TTS_API_KEY=$GOOGLE_TTS_API_KEY
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
CMD [ "node", "./src/main/bot.js" ]