import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Buffer } from 'buffer';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { SOLANA_ENDPOINT, SOLANA_NETWORK } from './solana';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App.tsx';
import './index.css';

// Polyfill Buffer in browser environment for Solana web3.js
if (typeof window !== 'undefined' && !(window as any).Buffer) {
  (window as any).Buffer = Buffer;
}

function Root() {
  // Phantom and Solflare only as requested
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter({ network: SOLANA_NETWORK }),
    ],
    []
  );

  return (
    <ErrorBoundary>
      <ConnectionProvider endpoint={SOLANA_ENDPOINT}>
        <WalletProvider wallets={wallets} autoConnect>
          <App />
        </WalletProvider>
      </ConnectionProvider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
