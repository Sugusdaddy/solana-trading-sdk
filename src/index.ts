// Main SDK exports
export { TradingClient, type TradingConfig, type SwapParams, type TransactionResult, type Quote } from './core/client';
export { PositionManager, type Position, type OpenPositionParams, type PositionManagerConfig } from './core/position';

// Re-export Solana types for convenience
export {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
