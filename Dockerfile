# Use the official Node.js 20 Alpine image for a thin, fast container
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Accept the Foundry Token from GCP Cloud Build
ARG FOUNDRY_TOKEN
ENV FOUNDRY_TOKEN=${FOUNDRY_TOKEN}

# Copy package.json, lockfiles, and crucially the .npmrc file for authentication
COPY package*.json .npmrc ./
RUN npm install

# Copy the rest of your application code
COPY . .

# Build the React frontend using Vite
# This will output the static files into the /dist folder
RUN npm run build

# Set the Node environment to production
ENV NODE_ENV=production

# Cloud Run defaults port to 8080.
# server.js already uses: const PORT = process.env.PORT ?? 3000;
ENV PORT=8080
EXPOSE 8080

# Start the Express backend server
CMD [ "npm", "start" ]
