#!/bin/bash
# =============================================================================
# CDSS — Database Setup Script
# Creates the PostgreSQL database, user, and initialises schema.
# Usage: chmod +x setup_db.sh && ./setup_db.sh
# =============================================================================

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

DB_NAME="cdss_db"
DB_USER="cdss_user"
DB_PASS="cdss_password"
DB_HOST="localhost"
DB_PORT="5432"

echo -e "${YELLOW}Setting up CDSS database...${NC}"

# Create user (ignore error if already exists)
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c \
  "DO \$\$ BEGIN
     IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
       CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
     END IF;
   END \$\$;" 2>/dev/null || true

# Create database (ignore error if already exists)
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c \
  "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c \
  "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

# Grant privileges
psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c \
  "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo -e "${GREEN}✓ Database '${DB_NAME}' ready with user '${DB_USER}'${NC}"
echo ""
echo -e "${YELLOW}Running schema migrations...${NC}"

# Apply raw SQL schema (for initial setup)
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  -f backend/database/schema.sql 2>&1 | grep -v "already exists" || true

echo -e "${GREEN}✓ Schema applied${NC}"
echo ""
echo -e "${GREEN}Database setup complete!${NC}"
echo "  Host:     ${DB_HOST}:${DB_PORT}"
echo "  Database: ${DB_NAME}"
echo "  User:     ${DB_USER}"
echo ""
echo "Connection string:"
echo "  postgresql+asyncpg://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
