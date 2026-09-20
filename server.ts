import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { evaluateNyseSession, runUpdateSession } from './functions/updateSession';
import { runUpdatePrices, fetchLiveOraclePrices } from './functions/updatePrices';
import { runSuggestDesk } from './functions/suggestDesk';
import { getDeskRationale } from './src/utils/deskTheses';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Health check & diagnostics
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    credentials: {
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      marketDataConfigured: !!(process.env.FINNHUB_API_KEY || process.env.MARKET_DATA_API_KEY),
      customSolanaRpcConfigured: !!process.env.SOLANA_RPC_URL,
    },
  });
});

// API: Geo-compliance check (non-US status check)
app.get('/api/compliance', (req, res) => {
  const countryHeader =
    req.headers['cf-ipcountry'] ||
    req.headers['x-country-code'] ||
    req.headers['x-appengine-country'] ||
    'UNKNOWN';

  const isUsPerson = countryHeader === 'US';
  res.json({
    country: countryHeader,
    isUsPerson,
    restricted: isUsPerson,
    disclaimer: 'These tokens are not for US persons. Not equity. Demo only.',
  });
});

// API: Current evaluated NYSE session
app.get('/api/status', async (req, res) => {
  try {
    const session = await evaluateNyseSession();
    res.json({
      success: true,
      data: session,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to evaluate session' });
  }
});

// API: Live stocks with real quotes from Finnhub & Jupiter
app.get('/api/stocks', async (req, res) => {
  try {
    const stocks = await fetchLiveOraclePrices();
    res.json({
      success: true,
      data: stocks,
      source: (process.env.FINNHUB_API_KEY || process.env.MARKET_DATA_API_KEY) ? 'finnhub_live' : 'dex_baseline',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch stocks' });
  }
});

// API: Manual, Cloud Scheduler or Webhook-triggered sync (supports GET & POST)
const handleSync = async (req: express.Request, res: express.Response) => {
  try {
    await runUpdateSession();
    await runUpdatePrices();
    const session = await evaluateNyseSession();
    if (!session.nyseOpen) {
      await runSuggestDesk();
    }
    res.json({ success: true, message: 'Sync completed', session });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Sync failed' });
  }
};

app.get('/api/sync', handleSync);
app.post('/api/sync', handleSync);

// API: After-hours AI Desk suggestion
app.get('/api/suggestion', async (req, res) => {
  try {
    const suggestion = await runSuggestDesk();
    res.json({ success: true, data: suggestion });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to generate suggestion' });
  }
});

// API: On-demand stock analysis powered by Gemini with curated fallback
app.get('/api/desk/analyze', async (req, res) => {
  const ticker = String(req.query.ticker || 'TSLA').toUpperCase();
  const gap = parseFloat(String(req.query.gap || '0'));
  const price = parseFloat(String(req.query.price || '0'));
  const close = parseFloat(String(req.query.close || '0'));
  const size = parseInt(String(req.query.size || '5'), 10);

  const fallback = getDeskRationale(ticker, gap, size);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.json({ success: true, source: 'curated_desk', ...fallback });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const formattedGap = `${gap >= 0 ? '+' : ''}${gap.toFixed(2)}%`;
    const prompt = `Stock: ${ticker}
Last NYSE Close: $${close.toFixed(2)}
Live Onchain Price: $${price.toFixed(2)}
Off-Hours Gap: ${formattedGap}
Ticket Size: $${size}

You are an institutional trading analyst for CloseLine's 24/7 tokenized stock desk.
Provide a sharp, 2-sentence market analysis for this stock:
1st sentence: Explain the fundamental, macro, or liquidity reason why ${ticker} has dislocated from its official close while traditional exchanges are closed, and YOU MUST EXPLICITLY INCLUDE the gap percentage (${formattedGap}) in the sentence.
2nd sentence: Explain the tactical thesis for sizing a $${size} micro-ticket ahead of the 9:30 AM EST opening bell.
SAFETY DIRECTIVE: Do NOT claim you are executing or broadcasting transactions; human confirmation is always required. Do not include markdown headers or bullet points. Output strictly the 2 sentences.`;

    // Cascade across available flash models to guarantee resilience against temporary 503 high-demand spikes
    const modelCandidates = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
    let text = '';
    let usedModel = 'gemini-3.6-flash';

    for (const modelName of modelCandidates) {
      try {
        const aiPromise = ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('AI timeout')), 8000)
        );

        const aiRes: any = await Promise.race([aiPromise, timeoutPromise]);
        const candidateText = aiRes?.text?.trim();
        if (candidateText) {
          text = candidateText;
          usedModel = modelName;
          break;
        }
      } catch (err: any) {
        const is503 = err?.status === 'UNAVAILABLE' || err?.message?.includes('503') || err?.message?.includes('high demand');
        if (is503) {
          console.info(`[api/desk/analyze] ${modelName} in high demand (503); failing over to next model...`);
        } else {
          console.warn(`[api/desk/analyze] ${modelName} call note:`, err?.message || err);
        }
      }
    }

    if (text) {
      return res.json({
        success: true,
        source: 'gemini_ai',
        model: usedModel,
        thesis: text,
        catalyst: fallback.catalyst,
        strategy: fallback.strategy,
      });
    }
  } catch (err: any) {
    console.warn('[api/desk/analyze] Desk research fallback utilized:', err?.message || err);
  }

  return res.json({ success: true, source: 'curated_desk', ...fallback });
});

// API: Jupiter Swap & Quote Proxy to prevent browser CORS or iframe referrer restrictions
app.get('/api/jupiter/quote', async (req, res) => {
  try {
    const { inputMint, outputMint, amount, slippageBps = '50' } = req.query;
    if (!inputMint || !outputMint || !amount) {
      return res.status(400).json({ error: 'Missing required query parameters: inputMint, outputMint, amount' });
    }

    const jupiterUrl = `https://api.jup.ag/swap/v1/quote?inputMint=${encodeURIComponent(
      String(inputMint)
    )}&outputMint=${encodeURIComponent(String(outputMint))}&amount=${encodeURIComponent(
      String(amount)
    )}&slippageBps=${encodeURIComponent(String(slippageBps))}`;

    const response = await fetch(jupiterUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: `Jupiter API quote error: ${errBody}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error('Jupiter quote proxy error:', err);
    return res.status(502).json({ error: err?.message || 'Failed to query Jupiter proxy' });
  }
});

app.post('/api/jupiter/swap', async (req, res) => {
  try {
    const response = await fetch('https://api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req.body),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return res.status(response.status).json({ error: `Jupiter API swap error: ${errBody}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (err: any) {
    console.error('Jupiter swap proxy error:', err);
    return res.status(502).json({ error: err?.message || 'Failed to generate swap transaction' });
  }
});

// Background automation loop (Every 60 seconds)
async function startAutomatedMarketSync() {
  const tick = async () => {
    try {
      // Evaluate session memory state
      await evaluateNyseSession();
      // Only call admin functions if service account or admin is configured
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT) {
        await runUpdateSession();
        await runUpdatePrices();
        const session = await evaluateNyseSession();
        if (!session.nyseOpen) {
          await runSuggestDesk();
        }
      }
    } catch (err: any) {
      // Periodic background sync notice
    }
  };

  // Run initial sync after server starts
  setTimeout(tick, 3000);

  // Repeat every 60 seconds
  setInterval(tick, 60000);
}

async function startServer() {
  // Mount Vite middleware in development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    startAutomatedMarketSync();
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
