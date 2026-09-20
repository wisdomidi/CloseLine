/**
 * Cloud Function Sketch: updateSession
 *
 * Purpose:
 * Periodically evaluate the current time in America/New_York and update
 * the `market/status` document in Cloud Firestore.
 *
 * Rules:
 * - Open if weekday (Mon–Fri) and ET time is 09:30 – 16:00
 * - Otherwise closed
 * - sessionLabel examples: "NYSE open", "NYSE closed", "Weekend"
 *
 * NOTE ON HOLIDAYS:
 * Do not put a US holiday calendar in the React frontend!
 * Any holiday list / schedule should be maintained in a dedicated Firestore
 * document or collection (e.g., `market/holidays` or `settings/holidays`)
 * that is read ONLY by this backend function before deciding `nyseOpen`.
 *
 * Deployment Options:
 * 1. Firebase Scheduled Function (Cloud Functions v2):
 *    export const updateSession = onSchedule({
 *      schedule: "every 1 minutes",
 *      timeZone: "America/New_York",
 *    }, async (event) => { await runUpdateSession(); });
 *
 * 2. Google Cloud Scheduler calling an HTTP Cloud Function or Cloud Run endpoint.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';

if (getApps().length === 0) {
  initializeApp({
    projectId: PROJECT_ID,
  });
}

const db = getFirestore(DATABASE_ID);

export interface NyseSessionEvaluation {
  nyseOpen: boolean;
  sessionLabel: string;
  isWeekend: boolean;
  timeEt: string;
}

// Official 2026 NYSE Market Holidays
export const NYSE_HOLIDAYS_2026: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Washington's Birthday (Presidents' Day)",
  '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth National Independence Day',
  '2026-07-03': 'Independence Day (Observed)',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving Day',
  '2026-12-25': 'Christmas Day',
};

/**
 * Calculates current market session state in America/New_York.
 */
export async function evaluateNyseSession(): Promise<NyseSessionEvaluation> {
  const now = new Date();

  // Format to America/New_York timezone parts
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value; // 'Mon', 'Tue', etc.
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const hour = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10);
  const minute = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10);

  const dateKey = `${year}-${month}-${day}`;
  const holidayName = NYSE_HOLIDAYS_2026[dateKey];

  const isWeekend = weekday === 'Sat' || weekday === 'Sun';
  const totalMinutes = hour * 60 + minute;

  // NYSE Regular Trading Hours: 9:30 AM (570m) to 4:00 PM (960m) ET
  const isOpenHours = totalMinutes >= 570 && totalMinutes < 960;
  const nyseOpen = !isWeekend && !holidayName && isOpenHours;

  let sessionLabel = 'NYSE closed';
  if (holidayName) {
    sessionLabel = `${holidayName} (NYSE closed)`;
  } else if (isWeekend) {
    sessionLabel = 'Weekend';
  } else if (nyseOpen) {
    sessionLabel = 'NYSE open';
  } else if (totalMinutes < 570) {
    sessionLabel = 'Pre-market';
  } else {
    sessionLabel = 'NYSE closed';
  }

  const timeEt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(now);

  return {
    nyseOpen,
    sessionLabel,
    isWeekend: isWeekend || !!holidayName,
    timeEt,
  };
}

/**
 * Main execution handler to write status to Firestore.
 */
export async function runUpdateSession(): Promise<void> {
  const session = await evaluateNyseSession();

  console.log(`[updateSession] Updating market/status: nyseOpen=${session.nyseOpen}, sessionLabel=${session.sessionLabel}`);

  const statusRef = db.collection('market').doc('status');
  await statusRef.set(
    {
      nyseOpen: session.nyseOpen,
      sessionLabel: session.sessionLabel,
      asOf: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log('[updateSession] Successfully updated market/status');
}

// If executed directly (e.g. via `node -r tsx functions/updateSession.ts`):
if (process.argv[1] && process.argv[1].endsWith('updateSession.ts')) {
  runUpdateSession()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[updateSession] Error executing session update:', err);
      process.exit(1);
    });
}
