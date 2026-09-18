# FieldOps Kunde (`mobileapp_client/customer`)

React Native CLI app for end customers (`de.fieldops.customer`). Warm paper UI. Not Expo.

## Layout

```
App.tsx           Register, wait-for-office, jobs, invoices, notices, CMS pages
src/api.ts        fetch to /api/v1 with Bearer token
src/config.ts     Live API; `USE_LOCAL_API` for emulator/simulator
src/theme.ts      Customer colors + 4-step tracker
```

Token: AsyncStorage `fieldops.customer.token`. After register, `can_create_jobs` is false until office verifies. Then tabs: Home, Auftrag, Status, Post.

Legal links (Datenschutz, FAQ, …) load `GET /api/v1/content?audience=customer`.

## Run

```powershell
cd mobileapp_client/customer
npm install
npm start
npm run android
# iOS: npm run ios
```

Login: `james.b@example.com` / `FieldOps!2026`.

Physical device against local API: set `USE_LOCAL_API` and replace the host with your machine LAN IP.
