#!/bin/sh

echo "Starting VNP Scraper Backend..."

# Wait for MongoDB to be ready
echo "Waiting for MongoDB to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  # Try to connect to MongoDB using the connection string from environment
  if npx prisma db pull --force 2>/dev/null; then
    echo "MongoDB is ready!"
    break
  else
    echo "MongoDB not ready yet. Retrying in 2 seconds... (Attempt $((RETRY_COUNT + 1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT + 1))
  fi
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "Failed to connect to MongoDB after $MAX_RETRIES attempts"
  exit 1
fi

# Generate Prisma client
echo "Generating Prisma client..."
npx prisma generate

# Run database migrations/push
echo "Applying database schema changes..."
npx prisma db push --skip-generate

echo "Database schema is up to date!"

# Start the application
echo "Starting the application..."
npm run start:prod