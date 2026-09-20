# CloseLine — Firebase Configuration

To connect CloseLine to your Firebase project, set the following environment variables in your `.env` or environment configuration:

```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

## Data Model

### Collection: `market`
- **Document `status`**:
  - `nyseOpen`: `boolean` (e.g. `true` or `false`)
  - `sessionLabel`: `string` (e.g. `"NYSE open"` or `"NYSE closed"`)
  - `asOf`: `timestamp`

### Collection: `stocks`
One document per ticker (`AAPL`, `NVDA`, `TSLA`, `META`, `AMZN`, `MSFT`):
- `ticker`: `string` (e.g. `"AAPL"`)
- `name`: `string` (e.g. `"Apple Inc."`)
- `lastClose`: `number` (e.g. `228.50`)
- `livePrice`: `number` (e.g. `224.15`)
- `asOf`: `timestamp`

### One-Time Seed Flag
In `src/firebase.ts` or `src/config.ts`, set `seedOnEmpty = true` to automatically initialize the 6 stock records and market status on first load if the database is empty. Once seeded, turn `seedOnEmpty = false`.
