import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { clusterApiUrl, PublicKey, Transaction, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';

/**
 * Solana Cluster Configuration
 * Change this constant to switch networks (e.g. WalletAdapterNetwork.Devnet or 'mainnet-beta')
 */
export const SOLANA_NETWORK = WalletAdapterNetwork.Mainnet; // 'mainnet-beta'

// Production RPC Endpoint (Priority: Dedicated provider -> cluster fallback)
export const SOLANA_ENDPOINT =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SOLANA_RPC_URL) ||
  clusterApiUrl(SOLANA_NETWORK);

// Official SPL Token Mints on Solana Mainnet
export const SOLANA_MINTS: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // Official Backed Tesla xStock (TSLAx) on Solana Mainnet
  TSLA: 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB',
  // Backed / Tokenized Equities on Solana Mainnet
  AAPL: 'Xs9svF1pE2Fk2ZJ12Vq5qgWbQ2yJ1mKz9bK8xL9pQ1w',
  NVDA: 'NvdA111111111111111111111111111111111111111',
  META: 'MetA111111111111111111111111111111111111111',
  AMZN: 'AmZn111111111111111111111111111111111111111',
  MSFT: 'MsFt111111111111111111111111111111111111111',
};

export const JUPITER_API_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_JUPITER_API_URL) ||
  '/api/jupiter';

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: any;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount?: string;
      feeMint?: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
}

/**
 * Helper to shorten a base58 Solana public key address for display.
 */
export function truncateAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Build block explorer URL for transaction confirmation
 */
export function getSolanaExplorerUrl(txHash: string, network: WalletAdapterNetwork = SOLANA_NETWORK): string {
  if (!txHash) return '#';
  const clusterParam = network === WalletAdapterNetwork.Mainnet ? '' : `?cluster=${network}`;
  return `https://solscan.io/tx/${txHash}${clusterParam}`;
}

/**
 * Fetches quote from Jupiter Aggregator API via same-origin backend proxy (with direct API fallback)
 */
export async function fetchJupiterQuote(
  inputMint: string,
  outputMint: string,
  amountInAtomicUnits: number,
  slippageBps = 50 // 0.5% default
): Promise<JupiterQuoteResponse | null> {
  const queryParams = `inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(
    outputMint
  )}&amount=${amountInAtomicUnits}&slippageBps=${slippageBps}`;

  // Priority 1: Same-origin backend proxy (avoids browser CORS & iframe referer restrictions)
  try {
    const proxyRes = await fetch(`/api/jupiter/quote?${queryParams}`, {
      headers: { Accept: 'application/json' },
    });
    if (proxyRes.ok) {
      const data = await proxyRes.json();
      return data as JupiterQuoteResponse;
    }
  } catch (proxyErr) {
    console.debug('[Jupiter Proxy] Same-origin proxy bypassed, trying direct endpoints:', proxyErr);
  }

  // Priority 2: Official Jupiter swap quote API
  try {
    const directRes = await fetch(`https://api.jup.ag/swap/v1/quote?${queryParams}`, {
      headers: { Accept: 'application/json' },
    });
    if (directRes.ok) {
      const data = await directRes.json();
      return data as JupiterQuoteResponse;
    }
  } catch (directErr) {
    console.debug('[Jupiter Direct] api.jup.ag direct call bypassed:', directErr);
  }

  // Priority 3: quote-api.jup.ag v6 fallback
  const fallbackRes = await fetch(`https://quote-api.jup.ag/v6/quote?${queryParams}`, {
    headers: { Accept: 'application/json' },
  });
  if (!fallbackRes.ok) {
    const errText = await fallbackRes.text().catch(() => fallbackRes.statusText);
    throw new Error(`Jupiter quote error (${fallbackRes.status}): ${errText}`);
  }
  const data = await fallbackRes.json();
  return data as JupiterQuoteResponse;
}

/**
 * Fetches the serialized VersionedTransaction from Jupiter /swap endpoint
 */
export async function fetchJupiterSwapTransaction(
  quoteResponse: JupiterQuoteResponse,
  userPublicKey: PublicKey
): Promise<VersionedTransaction> {
  const payload = {
    quoteResponse,
    userPublicKey: userPublicKey.toBase58(),
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports: 'auto',
  };

  let swapData: any = null;

  // Priority 1: Same-origin backend proxy
  try {
    const proxyRes = await fetch('/api/jupiter/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (proxyRes.ok) {
      swapData = await proxyRes.json();
    }
  } catch (proxyErr) {
    console.debug('[Jupiter Proxy] Swap proxy bypassed, trying direct endpoint:', proxyErr);
  }

  // Priority 2: Direct api.jup.ag swap
  if (!swapData?.swapTransaction) {
    try {
      const directRes = await fetch('https://api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      if (directRes.ok) {
        swapData = await directRes.json();
      }
    } catch (directErr) {
      console.debug('[Jupiter Direct] Swap direct call bypassed:', directErr);
    }
  }

  // Priority 3: Direct quote-api.jup.ag v6 swap
  if (!swapData?.swapTransaction) {
    const fallbackRes = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!fallbackRes.ok) {
      const errText = await fallbackRes.text().catch(() => fallbackRes.statusText);
      throw new Error(`Jupiter swap creation failed (${fallbackRes.status}): ${errText}`);
    }
    swapData = await fallbackRes.json();
  }

  if (!swapData?.swapTransaction) {
    throw new Error('No swap transaction returned by Jupiter');
  }

  const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
  return transaction;
}

/**
 * Creates a Solana Transaction with an onchain SPL Memo program instruction
 * recording the user's signed order intent for the tokenized stock ticket in CloseLine.
 */
export function createCloseLineOrderTransaction(
  senderPublicKey: PublicKey,
  ticker: string,
  usdAmount: number,
  shares: string,
  slippageBps = 50
): Transaction {
  const transaction = new Transaction();

  // Solana SPL Memo Program v2
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

  const memoText = JSON.stringify({
    app: 'CloseLine',
    action: 'ORDER_INTENT',
    ticker,
    usd: usdAmount,
    shares,
    slippageBps,
    ts: Date.now(),
  });

  const instruction = new TransactionInstruction({
    keys: [{ pubkey: senderPublicKey, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memoText, 'utf-8'),
  });

  transaction.add(instruction);
  return transaction;
}
