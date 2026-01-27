# KÜHL Pricing Tracker

Track MSRP, Wholesale, and Cost by season for KÜHL products.

## Features

- **CSV Import**: Import product data from your existing exports
- **Pricing Analysis**: View Cost, Wholesale, and MSRP with margin calculations
- **Season Comparison**: Compare pricing trends across seasons
- **Filtering**: Filter by Division, Category, Season, Product Line, Designer
- **Carry Over Tracking**: See which products are new vs. carry over
- **CAD Pricing**: Support for Canadian pricing data
- **Export**: Export filtered data back to CSV

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deploy to Vercel

1. Push to GitHub
2. Import to Vercel
3. Deploy (no environment variables needed - uses localStorage)

## CSV Import Format

The app expects these columns (flexible matching):
- Style#, Style Desc, Clr, Clr Desc, Style/Color
- Division Desc, Cat Desc, Season
- Price (Wholesale), MSRP, Cost
- Carry Over, Carry Forward
- CAD-Price, CAD-MSRP, CAD-Last Cost Sheet
- Product Line, Product Line Desc
- Designer Name, Tech Designer Name
- And more...

## Upgrading to Supabase

For multi-user support and persistent storage, you can upgrade to Supabase:

1. Create a Supabase project
2. Add these environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Replace the localStorage-based store with Supabase client calls

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- PapaParse (CSV handling)
- Lucide React (icons)
