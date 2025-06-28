#!/bin/sh

echo "Waiting for Postgres to be ready..."
until pg_isready -h "$DB_HOST" -p 5432 -U "$DB_USER"; do
  sleep 1
done

echo "Running migrations..."
npx knex --knexfile ./src/knexfile.ts migrate:latest

echo "Seeding database..."
npx knex --knexfile ./src/knexfile.ts seed:run

echo "Starting server..."
exec node dist/index.js

# Manual migration and seeding (run from /backend):
#   npm run migrate:latest
#   npm run seed:run
