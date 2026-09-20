import { Timestamp } from 'firebase/firestore';

export interface StockDoc {
  ticker: string;
  name: string;
  lastClose?: number | null;
  livePrice?: number | null;
  asOf?: Timestamp | { seconds: number; nanoseconds: number } | Date | null;
}

export interface MarketStatusDoc {
  nyseOpen: boolean;
  sessionLabel: string;
  asOf?: Timestamp | { seconds: number; nanoseconds: number } | Date | null;
}

export interface MarketSuggestionDoc {
  ticker: string;
  usd: number;
  reason: string;
  asOf?: Timestamp | { seconds: number; nanoseconds: number } | Date | null;
}

export interface TradeDoc {
  id?: string;
  ticker: string;
  usd: number;
  ts: Timestamp | { seconds: number; nanoseconds: number } | Date;
  status: 'fill' | 'paper' | 'wallet_connected_pending_swap' | 'solana_confirmed' | string;
  wallet?: string;
  shares?: number | null;
  price?: number | null;
  txHash?: string;
  network?: string;
  inUsdc?: number | null;
  outTokens?: string | null;
  route?: string | null;
  priceImpactPct?: string | null;
}

export interface PortfolioPosition {
  ticker: string;
  name: string;
  totalShares: number;
  totalUsd: number;
  currentValue: number;
  unrealizedPnl: number;
  tradeCount: number;
}

export interface DisplayStock {
  ticker: string;
  name: string;
  lastClose: number | null;
  livePrice: number | null;
  gap: number | null; // (live - close) / close
  gapPercent: number | null; // gap * 100
  absGapPercent: number; // Math.abs(gapPercent) for sorting; 0 if missing
  priceDiff: number | null; // live - close
  asOf: Date | null;
  hasPrices: boolean;
}
