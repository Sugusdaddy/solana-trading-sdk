import { Connection, PublicKey, Keypair } from '@solana/web3.js';

export interface GridConfig {
  pair: { base: PublicKey; quote: PublicKey };
  lowerPrice: number;
  upperPrice: number;
  gridCount: number;
  totalInvestment: number;
  arithmetic: boolean; // true = arithmetic, false = geometric
}

export interface GridLevel {
  price: number;
  buyOrderId?: string;
  sellOrderId?: string;
  filled: boolean;
}

export interface GridBot {
  id: string;
  config: GridConfig;
  levels: GridLevel[];
  status: 'active' | 'paused' | 'stopped';
  totalProfit: number;
  tradesExecuted: number;
  createdAt: number;
}

export class GridStrategy {
  private connection: Connection;
  private wallet: Keypair;
  private bots: Map<string, GridBot> = new Map();

  constructor(connection: Connection, wallet: Keypair) {
    this.connection = connection;
    this.wallet = wallet;
  }

  async createBot(config: GridConfig): Promise<GridBot> {
    const id = `grid_${Date.now()}`;
    const levels = this.calculateLevels(config);

    const bot: GridBot = {
      id,
      config,
      levels,
      status: 'active',
      totalProfit: 0,
      tradesExecuted: 0,
      createdAt: Date.now(),
    };

    this.bots.set(id, bot);
    await this.placeInitialOrders(bot);

    return bot;
  }

  private calculateLevels(config: GridConfig): GridLevel[] {
    const levels: GridLevel[] = [];
    const { lowerPrice, upperPrice, gridCount, arithmetic } = config;

    if (arithmetic) {
      const step = (upperPrice - lowerPrice) / gridCount;
      for (let i = 0; i <= gridCount; i++) {
        levels.push({
          price: lowerPrice + step * i,
          filled: false,
        });
      }
    } else {
      const ratio = Math.pow(upperPrice / lowerPrice, 1 / gridCount);
      for (let i = 0; i <= gridCount; i++) {
        levels.push({
          price: lowerPrice * Math.pow(ratio, i),
          filled: false,
        });
      }
    }

    return levels;
  }

  private async placeInitialOrders(bot: GridBot): Promise<void> {
    const currentPrice = await this.getCurrentPrice(bot.config.pair);
    
    for (const level of bot.levels) {
      if (level.price < currentPrice) {
        // Place buy order below current price
        level.buyOrderId = `buy_${level.price}`;
      } else {
        // Place sell order above current price
        level.sellOrderId = `sell_${level.price}`;
      }
    }
  }

  private async getCurrentPrice(pair: { base: PublicKey; quote: PublicKey }): Promise<number> {
    return 0;
  }

  async onPriceUpdate(botId: string, newPrice: number): Promise<void> {
    const bot = this.bots.get(botId);
    if (!bot || bot.status !== 'active') return;

    for (const level of bot.levels) {
      if (level.buyOrderId && newPrice <= level.price && !level.filled) {
        // Buy order filled
        level.filled = true;
        level.buyOrderId = undefined;
        level.sellOrderId = `sell_${level.price}`;
        bot.tradesExecuted++;
      }
      
      if (level.sellOrderId && newPrice >= level.price && level.filled) {
        // Sell order filled
        level.filled = false;
        level.sellOrderId = undefined;
        level.buyOrderId = `buy_${level.price}`;
        bot.tradesExecuted++;
        bot.totalProfit += this.calculateProfit(bot.config, level.price);
      }
    }
  }

  private calculateProfit(config: GridConfig, price: number): number {
    const gridSize = (config.upperPrice - config.lowerPrice) / config.gridCount;
    const amountPerGrid = config.totalInvestment / config.gridCount;
    return (gridSize / price) * amountPerGrid;
  }

  stopBot(botId: string): void {
    const bot = this.bots.get(botId);
    if (bot) bot.status = 'stopped';
  }

  getBot(botId: string): GridBot | undefined {
    return this.bots.get(botId);
  }
}
