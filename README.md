## Covid-19 Dataviz

Next.js app with a Prisma-powered API to visualize COVID-19 statistics.

## Prerequisites

- Node.js 20+ and npm for a local run
- Docker and Docker Compose if you prefer a fully containerized setup

## Environment variables

Defaults live in `.env`:

```
DATABASE_URL="postgresql://postgres:mypassword@localhost:5432/covid19_dataviz_db"
POSTGRES_USER=postgres
POSTGRES_PASSWORD=mypassword
POSTGRES_DB=covid19_dataviz_db
POSTGRES_PORT=5432
APP_PORT=3000
```

For local dev, make sure PostgreSQL is running on `localhost` with these credentials.  
In Docker Compose, the `frontend` service rewrites the connection string to target the `db` container; adjust the variables above before starting if needed.

## Run locally (outside Docker)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Apply Prisma migrations (schema must be versioned):
   ```bash
   npx prisma migrate deploy
   ```
3. (Optional) Import datasets:
   ```bash
   npm run import-covid
   npm run import-population
   ```
4. Start Next.js (dev, hot reload):
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000).


## Datasets (required for imports)

The CSV datasets are not versioned in the public repo. You must download them and place them locally:

- COVID-19 daily reports (Johns Hopkins CSSE):
  - Source: https://github.com/CSSEGISandData/COVID-19
  - Place CSV files in: `covid_19_daily_reports/` (file names like `MM-DD-YYYY.csv`)
- Population data (World Bank):
  - Source: https://data.worldbank.org/indicator/SP.POP.TOTL
  - Download the CSV (e.g. `API_SP.POP.TOTL_DS2_en_csv_v2_*.csv`)
  - Place it in: `country_population/` and keep the filename expected by the script:
    `API_SP.POP.TOTL_DS2_en_csv_v2_2461.csv`

## Run with Docker Compose

The project ships a multi-stage Dockerfile and `docker-compose.yml` to run the Next.js app (`frontend`) and a PostgreSQL database (`db`).

### Start

```bash
docker-compose build
docker-compose up -d frontend db
```

- App available at `http://localhost:${APP_PORT}` (3000 by default).
- Prisma runs `migrate deploy` on startup to apply migrations.
- PostgreSQL data is persisted in the `postgres_data` volume (DB exposed on host port 5433).

### Stop and clean

```bash
docker compose down
```

Add `-v` to also remove the data volume:

```bash
docker compose down -v
```

### Import data in Docker

The `covid_19_daily_reports` folder is baked into the image, so you can import from inside the container:

```bash
docker compose exec frontend npm run import-covid
docker compose exec frontend npm run import-population
```

If you need to re-seed from scratch: drop the volume (`docker compose down -v`), recreate, run migrations, then import data.

## Useful commands

- `npm run lint`: run ESLint.
- `npx prisma studio`: open Prisma Studio (requires DB access).

## Containerized structure

- `Dockerfile`: builds a Node 20 image, compiles Next.js, then runs `next start` after `prisma migrate deploy`.
- `docker-compose.yml`:
  - `frontend`: exposes port `${APP_PORT:-3000}`, depends on `db`.
  - `db`: PostgreSQL 16-alpine (host port 5433) with healthcheck.
- `.dockerignore`: excludes build artifacts and sensitive files from the Docker context.

## Notes on data and ratios

- COVID reports come from `covid_19_daily_reports` CSVs. Import wipes existing data; take a backup if needed.
- Population data (2020-2023) is imported via `npm run import-population`.
- Recovered global total shows `N/A` if the latest day has `totalRecovered = 0`.
