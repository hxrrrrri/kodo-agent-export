FROM node:20-alpine

WORKDIR /app

COPY package*.json /app/
RUN npm ci
RUN apk add --no-cache curl

COPY . /app

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
	CMD curl -f http://localhost:5173/ || exit 1

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
