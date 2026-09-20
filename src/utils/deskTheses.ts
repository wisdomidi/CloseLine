import { GoogleGenAI } from '@google/genai';

/**
 * Curated expert market theses for after-hours trading desk.
 * Provides institutional context on why dislocations happen,
 * asset-specific drivers, and strategic micro-ticket sizing rationale.
 */
export interface StockDeskRationale {
  thesis: string;
  catalyst: string;
  sentiment: 'bullish_gap' | 'bearish_discount' | 'neutral_range';
}

export const STOCK_DESK_INTELLIGENCE: Record<string, {
  thesisTemplate: (gap: string, size?: number) => string;
  catalyst: string;
  sentiment: 'bullish_gap' | 'bearish_discount' | 'neutral_range';
}> = {
  TSLA: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `TSLAx is ${gap} vs last cash close while NYSE is shut. $${size} ticket. You confirm.`,
    catalyst: 'Overnight token liquidity & off-hours price discovery',
    sentiment: 'bearish_discount',
  },
  AAPL: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `AAPLx is ${gap} vs last cash close while traditional exchanges remain dark. $${size} ticket. You confirm.`,
    catalyst: 'Overnight global turnover & tight spread maintenance',
    sentiment: 'neutral_range',
  },
  NVDA: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `NVDAx is ${gap} vs last cash close ahead of US equity open. $${size} ticket. You confirm.`,
    catalyst: 'AI compute momentum & overnight liquidity depth',
    sentiment: 'bullish_gap',
  },
  MSFT: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `MSFTx is ${gap} vs last cash close with dark session liquidity. $${size} ticket. You confirm.`,
    catalyst: 'Enterprise cloud stability & balanced off-hours spreads',
    sentiment: 'neutral_range',
  },
  AMZN: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `AMZNx is ${gap} vs last cash close while traditional floors are idle. $${size} ticket. You confirm.`,
    catalyst: 'Global e-commerce index flow & overnight auctions',
    sentiment: 'bearish_discount',
  },
  GOOGL: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `GOOGLx is ${gap} vs last cash close in off-hours trading. $${size} ticket. You confirm.`,
    catalyst: 'Tech index futures drift & overnight order books',
    sentiment: 'neutral_range',
  },
  META: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `METAx is ${gap} vs last cash close during off-hours trading. $${size} ticket. You confirm.`,
    catalyst: 'Ad yield sentiment & overnight liquidity pools',
    sentiment: 'bullish_gap',
  },
  SPY: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `SPYx is ${gap} vs last cash close outside regular US market hours. $${size} ticket. You confirm.`,
    catalyst: '24/7 benchmark macro exposure & global shifts',
    sentiment: 'neutral_range',
  },
  COIN: {
    thesisTemplate: (gap: string, size: number = 5) =>
      `COINx is ${gap} vs last cash close responding to 24/7 crypto markets. $${size} ticket. You confirm.`,
    catalyst: 'Weekend token volatility & onchain volume',
    sentiment: 'bullish_gap',
  },
};

/**
 * Returns dynamic, intelligent desk rationale for any stock based on its current gap.
 */
export function getDeskRationale(ticker: string, gapPercent: number | null, ticketSize: number = 5): {
  thesis: string;
  catalyst: string;
  strategy: string;
} {
  const base = STOCK_DESK_INTELLIGENCE[ticker.toUpperCase()];
  const formattedGap = gapPercent !== null ? `${gapPercent >= 0 ? '+' : ''}${gapPercent.toFixed(2)}%` : '0.00%';
  const isDiscount = gapPercent !== null && gapPercent < 0;

  if (base) {
    const strategy = isDiscount
      ? `Targets mean-reversion gap-fill when NYSE liquidity resumes.`
      : `Rides off-hours momentum with strictly bounded downside.`;
    return {
      thesis: base.thesisTemplate(formattedGap, ticketSize),
      catalyst: base.catalyst,
      strategy,
    };
  }

  // Fallback for custom/unlisted tickers
  return {
    thesis: `${ticker}x is ${formattedGap} vs last cash close while traditional markets are shut. $${ticketSize} ticket. You confirm.`,
    catalyst: 'Off-hours liquidity disparity & overnight price discovery',
    strategy: `Sizing a $${ticketSize} ticket for controlled off-hours positioning.`,
  };
}
