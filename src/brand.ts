export interface BrandInfo {
  brand: string;
  letter: string;
  tileClass: string;
}

export const BRANDS: Record<string, BrandInfo> = {
  AAPL: {
    brand: 'Apple',
    letter: 'A',
    tileClass: 'bg-zinc-800 text-zinc-100 border border-zinc-700/80 shadow-inner',
  },
  NVDA: {
    brand: 'NVIDIA',
    letter: 'N',
    tileClass: 'bg-zinc-800 text-emerald-400 border border-emerald-800/40 shadow-inner',
  },
  TSLA: {
    brand: 'Tesla',
    letter: 'T',
    tileClass: 'bg-zinc-800 text-rose-400 border border-rose-800/40 shadow-inner',
  },
  META: {
    brand: 'Meta',
    letter: 'M',
    tileClass: 'bg-zinc-800 text-blue-400 border border-blue-800/40 shadow-inner',
  },
  AMZN: {
    brand: 'Amazon',
    letter: 'A',
    tileClass: 'bg-zinc-800 text-amber-300 border border-amber-800/40 shadow-inner',
  },
  MSFT: {
    brand: 'Microsoft',
    letter: 'M',
    tileClass: 'bg-zinc-800 text-cyan-400 border border-cyan-800/40 shadow-inner',
  },
};

export function getBrandInfo(ticker: string, defaultName: string): BrandInfo {
  if (BRANDS[ticker]) {
    return BRANDS[ticker];
  }
  return {
    brand: defaultName || ticker,
    letter: ticker.charAt(0).toUpperCase() || '•',
    tileClass: 'bg-zinc-800 text-zinc-200 border border-zinc-700/80 shadow-inner',
  };
}
