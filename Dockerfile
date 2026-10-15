FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3000
USER node
CMD ["npm", "start"]
