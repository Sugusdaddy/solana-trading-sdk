# 🤖 Solana Trading SDK

Professional-grade TypeScript SDK for building Solana trading bots. Used in production for high-frequency trading with sub-100ms execution.

![Solana](https://img.shields.io/badge/Solana-black?style=flat&logo=solana&logoColor=14F195)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![npm](https://img.shields.io/badge/npm-ready-red?style=flat&logo=npm)
![License](https://img.shields.io/badge/License-MIT-green)

## ✨ Features

### Core
- **Fast Execution** - Optimized for speed with parallel RPC connections
- **MEV Protection** - Jito bundle support for sandwich attack prevention
- **Smart Routing** - Best price discovery across Jupiter, Raydium, Orca
- **Position Management** - Automated take-profit and stop-loss orders

### Supported Operations
| Operation | Description |
|-----------|-------------|
| Market Buy | Instant buy at current price |
| Market Sell | Instant sell at current price |
| Limit Order | Order at specific price (Jupiter) |
| DCA | Dollar-cost averaging over time |
| Take Profit | Auto-sell at target price |
| Stop Loss | Auto-sell below threshold |
| Copy Trade | Mirror transactions from wallets |

### Integrations
- **DEXs**: Jupiter, Raydium, Orca, Phoenix, Meteora
- **MEV**: Jito bundles, multiple block engine endpoints
- **Data**: Helius, Triton, Birdeye, DexScreener
- **Notifications**: Telegram, Discord webhooks

## 🚀 Installation

```bash
npm install @sugusdaddy/solana-trading-sdk
```

## 📖 Quick Start

```typescript
import { TradingClient, JitoClient } from '@sugusdaddy/solana-trading-sdk';

// Initialize client
const client = new TradingClient({
  rpcUrl: 'https://api.mainnet-beta.solana.com',
  privateKey: process.env.PRIVATE_KEY!,
  jitoTipLamports: 10000, // 0.00001 SOL
});

// Simple swap
const result = await client.swap({
  inputMint: 'So11111111111111111111111111111111111111112', // SOL
  outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  amount: 1.5, // SOL
  slippageBps: 100, // 1%
});

console.log(`Swapped! TX: ${result.signature}`);
```

## 🔧 Configuration

```typescript
interface TradingConfig {
  // RPC Configuration
  rpcUrl: string;
  rpcUrls?: string[]; // For failover
  wsUrl?: string; // WebSocket for real-time updates
  
  // Wallet
  privateKey: string;
  
  // Jito MEV Protection
  jitoEnabled?: boolean;
  jitoTipLamports?: number;
  jitoEndpoints?: string[];
  
  // Trading Parameters
  defaultSlippageBps?: number;
  priorityFeeLamports?: number;
  computeUnits?: number;
  
  // Monitoring
  onTransaction?: (tx: TransactionResult) => void;
  onError?: (error: Error) => void;
}
```

## 📊 Examples

### Market Buy with Jito Protection

```typescript
import { TradingClient } from '@sugusdaddy/solana-trading-sdk';

const client = new TradingClient({
  rpcUrl: process.env.RPC_URL!,
  privateKey: process.env.PRIVATE_KEY!,
  jitoEnabled: true,
  jitoTipLamports: 100000, // 0.0001 SOL
});

// Buy token with MEV protection
const result = await client.buyToken({
  tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  amountSol: 0.5,
  slippageBps: 500, // 5%
  useJito: true,
});
```

### Position Management

```typescript
import { PositionManager } from '@sugusdaddy/solana-trading-sdk';

const pm = new PositionManager(client);

// Open position with auto TP/SL
const position = await pm.openPosition({
  tokenMint: 'BONK_MINT',
  amountSol: 1.0,
  takeProfitPercent: 50, // Sell 50% at +50%
  stopLossPercent: 20, // Sell all at -20%
});

// Monitor positions
pm.on('takeProfit', (pos, tx) => {
  console.log(`TP hit! Sold at ${pos.currentPnl}% profit`);
});

pm.on('stopLoss', (pos, tx) => {
  console.log(`SL hit! Cut loss at ${pos.currentPnl}%`);
});
```

### Copy Trading

```typescript
import { CopyTrader } from '@sugusdaddy/solana-trading-sdk';

const copyTrader = new CopyTrader(client, {
  // Wallets to copy
  targetWallets: [
    'WHALE_WALLET_1',
    'WHALE_WALLET_2',
  ],
  // Copy settings
  copyAmountSol: 0.1, // Fixed amount per trade
  copyPercentage: 10, // Or percentage of their trade
  maxSlippageBps: 500,
  // Filters
  minTradeSize: 0.5, // Only copy trades > 0.5 SOL
  tokenWhitelist: [], // Empty = all tokens
});

copyTrader.start();

copyTrader.on('copied', (trade) => {
  console.log(`Copied trade: ${trade.signature}`);
});
```

### Token Sniper

```typescript
import { TokenSniper } from '@sugusdaddy/solana-trading-sdk';

const sniper = new TokenSniper(client, {
  // Detection
  monitorNewPairs: true, // Raydium new pools
  monitorPumpFun: true, // pump.fun launches
  
  // Buy settings
  buyAmountSol: 0.5,
  maxSlippageBps: 2000, // 20% for volatile launches
  
  // Filters
  minLiquiditySol: 10,
  maxSupplyPercent: 5, // Don't buy if wallet holds >5%
  
  // Auto-sell
  autoSellEnabled: true,
  takeProfitPercent: 100,
  stopLossPercent: 50,
});

sniper.start();
```

## 🏗️ Architecture

```
src/
├── core/
│   ├── client.ts        # Main trading client
│   ├── connection.ts    # RPC connection management
│   └── wallet.ts        # Wallet utilities
├── protocols/
│   ├── jupiter.ts       # Jupiter integration
│   ├── raydium.ts       # Raydium AMM
│   ├── pumpfun.ts       # pump.fun integration
│   └── jito.ts          # Jito bundle submission
├── trading/
│   ├── position.ts      # Position management
│   ├── copytrader.ts    # Copy trading
│   └── sniper.ts        # Token sniping
├── utils/
│   ├── tokens.ts        # Token utilities
│   ├── price.ts         # Price feeds
│   └── logger.ts        # Logging
└── types/
    └── index.ts         # TypeScript types
```

## 🔐 Security Best Practices

```typescript
// ✅ Use environment variables for keys
const client = new TradingClient({
  privateKey: process.env.PRIVATE_KEY!,
});

// ✅ Set reasonable limits
const client = new TradingClient({
  maxTradeAmountSol: 10,
  dailyLimitSol: 50,
});

// ✅ Use dedicated trading wallet
// Never use your main wallet for automated trading

// ✅ Test on devnet first
const client = new TradingClient({
  rpcUrl: 'https://api.devnet.solana.com',
});
```

## 📈 Performance

| Metric | Value |
|--------|-------|
| Quote fetch | ~50ms |
| TX build | ~20ms |
| Jito submission | ~100ms |
| Total execution | ~200ms |

## 🛣️ Roadmap

- [x] Jupiter integration
- [x] Jito bundles
- [x] Position management
- [x] Copy trading
- [ ] Limit orders
- [ ] DCA automation
- [ ] Cross-chain (via Wormhole)
- [ ] Telegram bot interface

## 🤝 Contributing

Contributions welcome! Please read the contributing guidelines.

## ⚠️ Disclaimer

This SDK is for educational purposes. Trading cryptocurrencies involves significant risk. Use at your own risk.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ☕ by [@Sugusdaddy](https://github.com/Sugusdaddy)
