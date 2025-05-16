# Use official Node.js base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port (Fly.io will map to this)
EXPOSE 3000

# Start server
CMD ["node", "index.js"]
