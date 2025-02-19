# Use the Node.js image with version 20.9.0
FROM node:20.9.0

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app's files into the container
COPY . .

# Expose the port your app will run on
EXPOSE 3005

# Set environment variables if needed (optional)
ENV NODE_ENV=production

# Run your application
CMD ["npm", "start"]