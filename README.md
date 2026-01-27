# KUHL Pricing Tracker

Track MSRP, Wholesale, Costs, and Sales by season for KUHL products.

## Features

- **Dashboard**: Overview of products, sales, and cost analysis
- **Season View**: Compare pricing across seasons with data source indicators
- **Sales View**: Track bookings, revenue, and customer performance
- **Costs View**: FOB, Landed, Duty, Tariff, Freight breakdown
- **Pricing View**: MSRP vs Wholesale comparison with margin analysis
- **Margins View**: Margin distribution and analysis
- **Line List View**: Internal working view matching Line List spreadsheet
- **Excel Import**: Import data from Line List and Landed Request sheets
- **Data Source Tracking**: See where each price comes from (pricebyseason, linelist, sales, landed sheet)

## Quick Start (Local Development)

```bash
# Install dependencies
npm install

# Run development server (uses Excel files from /data folder)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Railway

1. **Create Railway Account**: Go to [railway.app](https://railway.app) and sign up

2. **Create New Project**: Click "New Project" and select "Deploy from GitHub repo"

3. **Connect GitHub**: Authorize Railway and select your repository

4. **Add PostgreSQL Database**:
   - Click "New" in your project
   - Select "Database" → "PostgreSQL"
   - Wait for the database to provision

5. **Configure Environment Variables**:
   - Go to your web service settings → Variables
   - Add: `DATABASE_URL` = Click "Add Reference" → Select your PostgreSQL → `DATABASE_URL`

6. **Deploy**:
   - Railway will automatically build and deploy
   - The build command runs `prisma generate && next build`

7. **Run Database Migration**:
   - Go to your web service
   - Click "Settings" → "Redeploy" with `npx prisma db push` as the deploy command (one-time)
   - Or use Railway CLI: `railway run npx prisma db push`

8. **Seed Initial Data** (optional):
   - Use the Season Import Modal in the app to upload Excel files
   - Or run: `railway run npm run db:seed` (requires data files)

## Deploy to Render

1. **Create Render Account**: Go to [render.com](https://render.com) and sign up

2. **Create PostgreSQL Database**:
   - Click "New" → "PostgreSQL"
   - Select a region and plan
   - Copy the "Internal Database URL"

3. **Create Web Service**:
   - Click "New" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - Build Command: `npm install && npx prisma generate && npm run build`
     - Start Command: `npm start`
   - Add Environment Variable:
     - `DATABASE_URL` = Your PostgreSQL Internal Database URL

4. **Deploy**: Click "Create Web Service"

5. **Run Migration**:
   - Go to your service → "Shell"
   - Run: `npx prisma db push`

## Database Commands

```bash
# Generate Prisma client
npx prisma generate

# Push schema to database (no migration history)
npm run db:push

# Create migration (for production)
npm run db:migrate

# Open Prisma Studio (database GUI)
npm run db:studio

# Seed database from Excel files
npm run db:seed
```

## Data Architecture

### Pricing Waterfall (Priority Order)
1. **pricebyseason** file - Primary source for historical pricing
2. **Line List** - Secondary source for current season
3. **Sales** data - Fallback for sold products

### Cost Source
1. **Landed Request Sheet** - Primary source for landed costs
2. **Line List** - Secondary source if costs not in landed sheet

### Source Indicators
- `●` pricebyseason file
- `○` linelist
- `◇` sales data
- `■` landed_sheet

### Margin Calculation
```
Margin = (US Wholesale - Landed Cost) / US Wholesale × 100
```

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Prisma ORM
- PostgreSQL
- XLSX (Excel parsing)
- Lucide React (icons)

## Project Structure

```
├── prisma/
│   └── schema.prisma      # Database schema
├── scripts/
│   └── seed-database.ts   # Database seeder
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── data/      # Database API routes
│   │   │   └── load-data/ # Excel loading API
│   │   └── page.tsx       # Main app
│   ├── components/
│   │   ├── layout/        # Sidebar, Header, FilterBar
│   │   └── views/         # Dashboard, Season, Sales, etc.
│   ├── lib/
│   │   ├── prisma.ts      # Prisma client
│   │   └── xlsx-import.ts # Excel parser
│   └── types/
│       └── product.ts     # TypeScript types
└── data/                  # Excel files (local dev only)
```
