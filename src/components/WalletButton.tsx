import React, { useState, useRef, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Wallet, ChevronDown, LogOut, Copy, Check, ExternalLink } from 'lucide-react';
import { truncateAddress, SOLANA_NETWORK } from '../solana';

export const WalletButton: React.FC = () => {
  const {
    wallets,
    select,
    connect,
    disconnect,
    connecting,
    connected,
    publicKey,
    wallet,
  } = useWallet();

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectModalOpen, setSelectModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setSelectModalOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const base58 = publicKey ? publicKey.toBase58() : '';

  const handleCopy = async () => {
    if (!base58) return;
    try {
      await navigator.clipboard.writeText(base58);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (err) {
      console.error('Wallet disconnect error:', err);
    }
    setMenuOpen(false);
  };

  const handleSelectWallet = async (walletName: any) => {
    try {
      select(walletName);
      setSelectModalOpen(false);
      // Wait for selection then trigger connect
      setTimeout(() => {
        connect().catch((e) => {
          // User rejected or modal dismissed
          console.debug('Connect notification:', e);
        });
      }, 100);
    } catch (err) {
      console.error('Select wallet error:', err);
    }
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {!connected ? (
        <button
          id="connect-wallet-btn"
          onClick={() => setSelectModalOpen(!selectModalOpen)}
          disabled={connecting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-mono text-xs font-semibold shadow-sm transition-all active:scale-95 disabled:opacity-50"
        >
          <Wallet className="w-3.5 h-3.5" />
          <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
        </button>
      ) : (
        <button
          id="connected-wallet-menu-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-200 font-mono text-xs transition-colors"
          aria-label="Wallet menu"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold text-zinc-100">{truncateAddress(base58, 4)}</span>
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      )}

      {/* Disconnect & Details Small Menu */}
      {connected && menuOpen && (
        <div
          id="wallet-dropdown-menu"
          className="absolute right-0 mt-2 w-64 rounded-xl bg-zinc-900 border border-zinc-800 p-3 shadow-2xl z-50 animate-in fade-in zoom-in-95 font-mono text-xs"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
            <div className="flex items-center gap-1.5">
              {wallet?.adapter.icon && (
                <img
                  src={wallet.adapter.icon}
                  alt={wallet.adapter.name}
                  className="w-4 h-4 rounded-full"
                  referrerPolicy="no-referrer"
                />
              )}
              <span className="font-semibold text-zinc-200">{wallet?.adapter.name || 'Solana Wallet'}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-400 font-mono">
              {SOLANA_NETWORK}
            </span>
          </div>

          {/* Full address + Copy */}
          <div className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 mb-3 flex items-center justify-between gap-2">
            <span className="text-zinc-400 text-[11px] truncate select-all">{base58}</span>
            <button
              id="copy-wallet-address-btn"
              onClick={handleCopy}
              className="text-zinc-400 hover:text-white p-1 rounded hover:bg-zinc-800 transition-colors flex-shrink-0"
              title="Copy address"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Explorer Link */}
          <a
            href={`https://explorer.solana.com/address/${base58}${SOLANA_NETWORK !== 'mainnet-beta' ? `?cluster=${SOLANA_NETWORK}` : ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between px-2 py-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors mb-2"
          >
            <span>View on Explorer</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          {/* Disconnect Button */}
          <button
            id="disconnect-wallet-btn"
            onClick={handleDisconnect}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-medium transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      )}

      {/* Select Wallet Modal / Dropdown (Phantom & Solflare only) */}
      {selectModalOpen && !connected && (
        <div
          id="select-wallet-modal"
          className="absolute right-0 mt-2 w-56 rounded-xl bg-zinc-900 border border-zinc-800 p-2 shadow-2xl z-50 font-mono text-xs"
        >
          <div className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 mb-1">
            Connect Solana Wallet
          </div>
          <div className="space-y-1">
            {wallets.map((w) => {
              const isInstalled = w.readyState === 'Installed';
              return (
                <button
                  key={w.adapter.name}
                  id={`select-wallet-${w.adapter.name.toLowerCase()}`}
                  onClick={() => handleSelectWallet(w.adapter.name)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800/80 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    {w.adapter.icon ? (
                      <img
                        src={w.adapter.icon}
                        alt={w.adapter.name}
                        className="w-5 h-5 rounded-full"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <Wallet className="w-4 h-4 text-zinc-400" />
                    )}
                    <span className="font-medium text-zinc-200 group-hover:text-white">
                      {w.adapter.name}
                    </span>
                  </div>
                  {isInstalled && (
                    <span className="text-[9px] px-1 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Detected
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
