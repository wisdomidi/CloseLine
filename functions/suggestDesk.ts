/**
 * Cloud Function: suggestDesk
 *
 * Purpose:
 * Evaluates the tokenized stock with the largest absolute gap during
 * after-hours / closed market sessions, requests a concise two-sentence analysis
 * from Gemini via GEMINI_API_KEY, and writes the suggestion to `market/suggestion`
 * in Cloud Firestore:
 * { ticker, usd, reason, asOf }
 *
 * CRITICAL SAFETY DIRECTIVE:
 * The model must NEVER send or execute a transaction.
 * A human user must explicitly review and click Confirm.
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || firebaseConfig.firestoreDatabaseId || '(default)';

// Initialize Firestore if ADC is available, otherwise skip admin grpc calls
let db: any = null;
try {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    if (getApps().length === 0) {
      initializeApp({ projectId: PROJECT_ID });
    }
    db = getFirestore(DATABASE_ID);
  }
} catch {
  db = null;
}

export interface SuggestionPayload {
  ticker: string;
  usd: number;
  reason: string;
  asOf: any;
}

interface StockItem {
  ticker: string;
  name: string;
  lastClose: number;
  livePrice: number;
  gapPercent: number;
  absGapPercent: number;
}

const FALLBACK_STOCKS = [
  { ticker: 'TSLA', name: 'Tesla, Inc.', lastClose: 248.80, livePrice: 236.10 },
  { ticker: 'NVDA', name: 'NVIDIA Corporation', lastClose: 120.40, livePrice: 128.25 },
  { ticker: 'AAPL', name: 'Apple Inc.', lastClose: 228.50, livePrice: 224.15 },
  { ticker: 'META', name: 'Meta Platforms, Inc.', lastClose: 560.20, livePrice: 578.40 },
  { ticker: 'AMZN', name: 'Amazon.com, Inc.', lastClose: 188.90, livePrice: 191.15 },
  { ticker: 'MSFT', name: 'Microsoft Corporation', lastClose: 432.10, livePrice: 434.25 },
];

/**
 * Generates two-sentence after-hours desk reasoning using Gemini or client template.
 */
export async function runSuggestDesk(): Promise<SuggestionPayload> {
  console.log('[suggestDesk] Evaluating after-hours desk suggestion...');

  // 1. Fetch stocks from Firestore if available or use fallback
  let stockData = FALLBACK_STOCKS;
  if (db) {
    try {
      const fetchWithTimeout = Promise.race([
        db.collection('stocks').get(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firestore admin timeout')), 1200))
      ]);
      const stocksSnap = await fetchWithTimeout;
      const rawList: any[] = [];
      if (stocksSnap && !stocksSnap.empty) {
        stocksSnap.forEach((doc: any) => {
          const d = doc.data();
          if (typeof d.lastClose === 'number' && typeof d.livePrice === 'number' && d.lastClose > 0) {
            rawList.push({
              ticker: d.ticker || doc.id,
              name: d.name || d.ticker || doc.id,
              lastClose: d.lastClose,
              livePrice: d.livePrice,
            });
          }
        });
      }
      if (rawList.length > 0) {
        stockData = rawList;
      }
    } catch (readErr: any) {
      console.warn('[suggestDesk] Firestore admin read note:', readErr?.message || readErr);
    }
  }

  // 2. Identify the stock with the largest absolute gap %
  const evaluated: StockItem[] = stockData.map((s) => {
    const gap = (s.livePrice - s.lastClose) / s.lastClose;
    const gapPercent = gap * 100;
    return {
      ...s,
      gapPercent,
      absGapPercent: Math.abs(gapPercent),
    };
  });

  evaluated.sort((a, b) => b.absGapPercent - a.absGapPercent);
  const topStock = evaluated[0];

  const formattedGap = `${topStock.gapPercent >= 0 ? '+' : ''}${topStock.gapPercent.toFixed(2)}%`;
  const defaultTemplateReason = `${topStock.ticker} is ${formattedGap} vs last close while NYSE is closed. Suggested ticket $20.`;

  let finalReason = defaultTemplateReason;

  // 3. Request two-sentence reason from Gemini if GEMINI_API_KEY is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const prompt = `Stock: ${topStock.ticker} (${topStock.name})
Last NYSE Close: $${topStock.lastClose.toFixed(2)}
Live Onchain Price: $${topStock.livePrice.toFixed(2)}
After-hours Gap: ${formattedGap}
Suggested Ticket Size: $20

Task:
Write strictly two concise, professional market sentences explaining this after-hours price gap for CloseLine's desk and proposing the $20 ticket.
Mandate: The first sentence MUST explicitly reference the gap percentage (${formattedGap}).
SAFETY RESTRICTION: You are only an advisory intelligence. You MUST NOT execute, sign, or broadcast transactions; human approval is required.
Output ONLY the two sentences with no extra formatting, disclaimers, or bullets.`;

      // Cascade across flash models to ensure resilience during peak demand spikes (503)
      const modelCandidates = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
      for (const modelName of modelCandidates) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
          });

          const generatedText = response.text?.trim();
          if (generatedText) {
            finalReason = generatedText;
            break;
          }
        } catch (mErr: any) {
          console.info(`[suggestDesk] ${modelName} unavailable, checking next:`, mErr?.message || mErr);
        }
      }
    } catch (aiErr) {
      console.warn('[suggestDesk] Gemini generation error, falling back to desk thesis:', aiErr);
      finalReason = defaultTemplateReason;
    }
  } else {
    console.log('[suggestDesk] No GEMINI_API_KEY provided; using default two-sentence template.');
  }

  // 4. Write suggestion to Firestore market/suggestion
  const payload = {
    ticker: topStock.ticker,
    usd: 20,
    reason: finalReason,
    asOf: FieldValue.serverTimestamp(),
  };

  if (db) {
    try {
      const suggestionRef = db.collection('market').doc('suggestion');
      await Promise.race([
        suggestionRef.set(payload, { merge: true }),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Firestore write timeout')), 1200))
      ]);
      console.log(`[suggestDesk] Written suggestion for ${topStock.ticker}: "${finalReason}"`);
    } catch (writeErr: any) {
      console.warn('[suggestDesk] Note: Local admin write without ADC credentials; suggestion generated successfully:', writeErr?.message || writeErr);
    }
  }

  return {
    ...payload,
    asOf: new Date(),
  };
}

// If executed directly (e.g. via `node -r tsx functions/suggestDesk.ts`)
if (process.argv[1] && process.argv[1].endsWith('suggestDesk.ts')) {
  runSuggestDesk()
    .then((res) => {
      console.log('[suggestDesk] Complete:', res);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[suggestDesk] Execution failed:', err);
      process.exit(1);
    });
}
