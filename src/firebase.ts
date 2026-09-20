import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  setLogLevel,
  doc,
  collection,
  onSnapshot,
  setDoc,
  getDocs,
  addDoc,
  query,
  orderBy,
  limit,
  Timestamp,
  Firestore,
} from 'firebase/firestore';
import firebaseConfigFallback from '../firebase-applet-config.json';
import { StockDoc, MarketStatusDoc, MarketSuggestionDoc, DisplayStock, TradeDoc } from './types';

// Silence Firestore internal network reconnect warnings to prevent false-positive error triggers in preview iframe
setLogLevel('silent');

// Flag to seed Firestore if empty (Set to true to seed, then set to false)
export const seedOnEmpty = false;

// 6 required ticker names and company names
export const DEFAULT_TICKERS: { ticker: string; name: string; lastClose: number; livePrice: number }[] = [
  { ticker: 'AAPL', name: 'Apple Inc.', lastClose: 337.00, livePrice: 336.13 },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', lastClose: 219.34, livePrice: 222.27 },
  { ticker: 'TSLA', name: 'Tesla, Inc.', lastClose: 366.20, livePrice: 364.27 },
  { ticker: 'META', name: 'Meta Platforms, Inc.', lastClose: 682.31, livePrice: 665.75 },
  { ticker: 'AMZN', name: 'Amazon.com, Inc.', lastClose: 251.19, livePrice: 253.71 },
  { ticker: 'MSFT', name: 'Microsoft Corporation', lastClose: 497.75, livePrice: 493.78 },
];

const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || firebaseConfigFallback.apiKey,
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigFallback.authDomain,
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || firebaseConfigFallback.projectId,
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigFallback.storageBucket,
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigFallback.messagingSenderId,
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || firebaseConfigFallback.appId,
};

// Initialize Firebase App singleton
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore targeting the provisioned database ID
const dbId = firebaseConfigFallback?.firestoreDatabaseId;
export const db: Firestore = dbId && dbId !== '(default)'
  ? getFirestore(app, dbId)
  : getFirestore(app);

let hasSeeded = false;

/**
 * Seed Firestore with initial 6 stocks and market status if empty.
 */
export async function seedFirestoreIfEmpty(): Promise<void> {
  if (!seedOnEmpty || hasSeeded) return;

  try {
    const stocksCol = collection(db, 'stocks');
    const snapshot = await getDocs(stocksCol);

    if (snapshot.empty && !hasSeeded) {
      hasSeeded = true;
      const now = Timestamp.now();

      // Seed market status
      const statusDocRef = doc(db, 'market', 'status');
      await setDoc(statusDocRef, {
        nyseOpen: false,
        sessionLabel: 'NYSE closed',
        asOf: now,
      } as MarketStatusDoc);

      // Seed 6 stock documents
      for (const item of DEFAULT_TICKERS) {
        const stockDocRef = doc(db, 'stocks', item.ticker);
        await setDoc(stockDocRef, {
          ticker: item.ticker,
          name: item.name,
          lastClose: item.lastClose,
          livePrice: item.livePrice,
          asOf: now,
        });
      }
    }
  } catch (error) {
    // Fail silently without crashing the app if permissions or network prevent seeding
    console.debug('Firestore seed check skipped:', error);
  }
}

/**
 * Subscribes to market/status document.
 */
export function subscribeToMarketStatus(
  callback: (status: MarketStatusDoc | null) => void,
  onError?: (err: Error) => void
): () => void {
  const statusDocRef = doc(db, 'market', 'status');
  return onSnapshot(
    statusDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as MarketStatusDoc);
      } else {
        callback(null);
      }
    },
    (error) => {
      // Graceful offline degradation - don't crash
      onError?.(error);
    }
  );
}

/**
 * Subscribes to market/suggestion document.
 */
export function subscribeToMarketSuggestion(
  callback: (suggestion: MarketSuggestionDoc | null) => void,
  onError?: (err: Error) => void
): () => void {
  const suggestionDocRef = doc(db, 'market', 'suggestion');
  return onSnapshot(
    suggestionDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as MarketSuggestionDoc);
      } else {
        callback(null);
      }
    },
    (error) => {
      onError?.(error);
    }
  );
}

/**
 * Subscribes to stocks collection.
 */
export function subscribeToStocks(
  callback: (stocks: Map<string, StockDoc>) => void,
  onError?: (err: Error) => void
): () => void {
  const stocksCol = collection(db, 'stocks');
  return onSnapshot(
    stocksCol,
    (snapshot) => {
      const stockMap = new Map<string, StockDoc>();
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as StockDoc;
        const ticker = data.ticker || docSnap.id;
        stockMap.set(ticker, { ...data, ticker });
      });
      callback(stockMap);
    },
    (error) => {
      // Graceful offline degradation - don't crash
      onError?.(error);
    }
  );
}

/**
 * Helper to normalize Firestore timestamps or dates.
 */
export function parseAsOfDate(asOf: any): Date | null {
  if (!asOf) return null;
  if (asOf instanceof Date) return asOf;
  if (typeof asOf.toDate === 'function') return asOf.toDate();
  if (typeof asOf.seconds === 'number') {
    return new Date(asOf.seconds * 1000 + (asOf.nanoseconds ? asOf.nanoseconds / 1000000 : 0));
  }
  if (typeof asOf === 'string' || typeof asOf === 'number') {
    const d = new Date(asOf);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * Merges the 6 required tickers with Firestore documents.
 * Keeps rows even if doc is missing, calculating gap when available.
 */
export function buildDisplayStocks(stocksMap: Map<string, StockDoc>): DisplayStock[] {
  const result: DisplayStock[] = DEFAULT_TICKERS.map((def) => {
    const docData = stocksMap.get(def.ticker);
    const name = docData?.name || def.name;
    const lastClose = typeof docData?.lastClose === 'number' ? docData.lastClose : null;
    const livePrice = typeof docData?.livePrice === 'number' ? docData.livePrice : null;
    const asOf = docData?.asOf ? parseAsOfDate(docData.asOf) : null;

    const hasPrices = lastClose !== null && livePrice !== null && lastClose > 0;
    let gap: number | null = null;
    let gapPercent: number | null = null;
    let absGapPercent = 0;
    let priceDiff: number | null = null;

    if (hasPrices && lastClose !== null && livePrice !== null) {
      gap = (livePrice - lastClose) / lastClose;
      gapPercent = gap * 100;
      absGapPercent = Math.abs(gapPercent);
      priceDiff = livePrice - lastClose;
    }

    return {
      ticker: def.ticker,
      name,
      lastClose,
      livePrice,
      gap,
      gapPercent,
      absGapPercent,
      priceDiff,
      asOf,
      hasPrices,
    };
  });

  // Pin TSLA to the top since it is the only stock with the live Jupiter swap flow (Track B), then sort remaining by absolute gap %
  return result.sort((a, b) => {
    if (a.ticker === 'TSLA') return -1;
    if (b.ticker === 'TSLA') return 1;
    return b.absGapPercent - a.absGapPercent;
  });
}

/**
 * Record a trade document in Cloud Firestore.
 * Conforms to firestore.rules: requires ['ticker', 'usd', 'ts'].
 * Strips all undefined fields to prevent Firestore unsupported field errors.
 */
export async function recordTrade(trade: Omit<TradeDoc, 'id'>): Promise<string> {
  const tradesCol = collection(db, 'trades');
  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(trade)) {
    if (value !== undefined) {
      sanitized[key] = value;
    }
  }

  const docRef = await addDoc(tradesCol, {
    ...sanitized,
    ts: trade.ts || Timestamp.now(),
  });
  return docRef.id;
}

/**
 * Subscribes to recent trades.
 */
export function subscribeToTrades(
  callback: (trades: TradeDoc[]) => void,
  onError?: (err: Error) => void
): () => void {
  const tradesCol = collection(db, 'trades');
  const tradesQuery = query(tradesCol, orderBy('ts', 'desc'), limit(50));

  return onSnapshot(
    tradesQuery,
    (snapshot) => {
      const items: TradeDoc[] = [];
      snapshot.forEach((docSnap) => {
        items.push({
          id: docSnap.id,
          ...(docSnap.data() as Omit<TradeDoc, 'id'>),
        });
      });
      callback(items);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export interface PricePoint {
  date: string;
  price: number;
}

/**
 * Fetches 7-day historical prices for a stock from Firestore 'history' collection,
 * or returns null if not available so component can use baseline interpolation.
 */
export async function fetchStockHistory(ticker: string): Promise<PricePoint[] | null> {
  try {
    const historyCol = collection(db, 'history');
    const q = query(historyCol, orderBy('date', 'asc'), limit(30));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const points: PricePoint[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data.ticker === ticker && typeof data.price === 'number') {
          points.push({
            date: data.date || docSnap.id,
            price: data.price,
          });
        }
      });
      if (points.length >= 2) return points;
    }
  } catch (err) {
    console.debug('Firestore history query note:', err);
  }
  return null;
}
