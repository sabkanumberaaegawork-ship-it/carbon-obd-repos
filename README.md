# CarbonOBD

A full-stack PWA for recording OBD-II fuel use, CO₂ and distance. Built with Next.js App Router, TypeScript, Tailwind CSS, Supabase (auth + Postgres + RLS) and Recharts.

## Features

- Email sign-up / sign-in with Supabase Auth.
- Add petrol or diesel vehicles.
- Live trip page with:
  - Web Bluetooth connection to a BLE ELM327 adapter (Nordic UART or FFE0 service).
  - Init sequence `ATZ`, `ATE0`, `ATSP0`.
  - 1 Hz polling of MAF `0110`, fuel rate `015E`, speed `010D`, RPM `010C`.
  - Unsupported PIDs are skipped instead of failing the trip.
  - Simulator mode with realistic fake readings (no car needed).
  - Readings saved to Postgres in batches of five; totals calculated on stop.
- Dashboard with trips table, CO₂-per-day chart, totals and g/km.
- Trip detail page with sensor chart and raw readings.
- Admin page with fleet-wide totals, gated by `profiles.is_admin`.
- Installable PWA with manifest, service worker and icons.

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste the whole contents of [`schema.sql`](./schema.sql) and run it.
3. Go to **Authentication → Providers → Email** and enable email auth.
   - For local development you can turn off *Confirm email*. If you leave it on, confirm the first user via the link in the inbox.
4. Copy **Project Settings → API → Project URL** and **anon / public key**.

Create `.env.local` in the project root:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Make an admin

After signing up once, run this in the Supabase SQL Editor:

```sql
update public.profiles
set is_admin = true
where email = 'you@example.com';
```

The Admin nav item appears after a page refresh. `profiles.is_admin` cannot be set by a normal user through RLS.

## 2. Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Useful scripts:

```bash
npm run build       # production build
npm start           # serve the production build
npm test            # emissions unit tests (Vitest)
npm run typecheck   # TypeScript check
npm run icons       # regenerate PWA PNG icons
```

## 3. Web Bluetooth notes

- Web Bluetooth requires a secure context: `https://` or `http://localhost`. It works in Chrome and Edge on desktop Android; it is not available in Safari or Firefox.
- Put the BLE ELM327 adapter into pairing mode, click **Connect**, and choose it in the browser picker.
- If your adapter uses a different UART UUID, add it to `optionalServices` in `src/lib/obd.ts`. Nordic UART (`6e400001-…`) and HM-10 style FFE0 are supported out of the box.
- Turn on **Simulator mode** to exercise the whole flow without a vehicle.

## 4. Calculations

All calculations live in [`src/lib/emissions.ts`](./src/lib/emissions.ts) and are covered by Vitest in `src/lib/emissions.test.ts`.

For each 1-second interval `dt` between consecutive readings:

- Fuel rate present: `litres = fuel_rate_L_per_h × dt / 3600`.
- No fuel rate on petrol: `fuel_g_per_s = MAF / 14.7`, then `litres = fuel_g_per_s × dt / 745`.
- Diesel without fuel rate: no CO₂ is invented; a reliability warning is shown.
- `CO₂ kg = litres × 2.31` (petrol) or `× 2.68` (diesel).
- `distance km = Σ(speed_kmh × dt / 3600)`.
- `g/km = CO₂ kg × 1000 / distance km`.

The stop API re-reads all stored readings and recomputes final totals server-side. A 5-second cap per interval protects totals from background-tab gaps.

## 5. Deploy

### Vercel (recommended)

1. Push this folder to a Git repository.
2. Import it into Vercel as a Next.js project.
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables.
4. Deploy. HTTPS is automatic, so Web Bluetooth and the PWA service worker work.

### Other Node hosts

```bash
npm ci
npm run build
npm start
```

Serve on HTTPS and proxy port 3000. The service worker is at `/sw.js` and the manifest at `/manifest.webmanifest`.

## Project structure

```text
src/app/(app)/          Protected pages: vehicles, live, dashboard, admin
src/app/api/            Route handlers for vehicles, trips, readings and stop
src/components/         Client UI components
src/lib/emissions.ts    Single tested calculation function
src/lib/obd.ts          Web Bluetooth ELM327 client
src/lib/simulator.ts    Fake 1 Hz readings
src/lib/supabase/       Browser, server and middleware clients
public/                 PWA manifest, service worker and icons
schema.sql              Supabase tables, indexes, triggers and RLS
```

## Security

Row Level Security restricts every table to the owner, with an extra `private.is_admin()` bypass for admins. The readings trigger prevents writing a reading under another user's trip. Only the public anon key is used in the browser; all access control is enforced by Postgres RLS.
