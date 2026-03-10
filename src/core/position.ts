import { EventEmitter } from 'eventemitter3';
import { TradingClient, TransactionResult } from './client';

export interface Position {
  id: string;
  tokenMint: string;
  entryPrice: number;
  entryAmount: number;
  currentPrice: number;
  currentAmount: number;
  entryTime: number;
  pnlPercent: number;
  pnlSol: number;
  takeProfitPercent?: number;
  stopLossPercent?: number;
  status: 'open' | 'closed' | 'partial';
}

export interface OpenPositionParams {
  tokenMint: string;
  amountSol: number;
  takeProfitPercent?: number;
  stopLossPercent?: number;
  trailingStopPercent?: number;
  slippageBps?: number;
  useJito?: boolean;
}

export interface PositionManagerConfig {
  pollIntervalMs?: number;
  autoCloseEnabled?: boolean;
}

export class PositionManager extends EventEmitter {
  private client: TradingClient;
  private positions: Map<string, Position> = new Map();
  private pollInterval: NodeJS.Timeout | null = null;
  private config: PositionManagerConfig;

  constructor(client: TradingClient, config: PositionManagerConfig = {}) {
    super();
    this.client = client;
    this.config = {
      pollIntervalMs: 5000,
      autoCloseEnabled: true,
      ...config,
    };
  }

  // Open a new position
  async openPosition(params: OpenPositionParams): Promise<Position | null> {
    const {
      tokenMint,
      amountSol,
      takeProfitPercent,
      stopLossPercent,
      slippageBps,
      useJito,
    } = params;

    // Execute buy
    const result = await this.client.buyToken({
      tokenMint,
      amountSol,
      slippageBps,
      useJito,
    });

    if (!result.success) {
      this.emit('error', new Error(`Failed to open position: ${result.error}`));
      return null;
    }

    // Get entry price
    const entryPrice = await this.getTokenPrice(tokenMint);
    const entryAmount = parseFloat(result.outputAmount);

    const position: Position = {
      id: `${tokenMint}-${Date.now()}`,
      tokenMint,
      entryPrice,
      entryAmount,
      currentPrice: entryPrice,
      currentAmount: entryAmount,
      entryTime: Date.now(),
      pnlPercent: 0,
      pnlSol: 0,
      takeProfitPercent,
      stopLossPercent,
      status: 'open',
    };

    this.positions.set(position.id, position);
    this.emit('opened', position);

    // Start monitoring if not already
    if (!this.pollInterval && this.config.autoCloseEnabled) {
      this.startMonitoring();
    }

    return position;
  }

  // Close a position
  async closePosition(
    positionId: string,
    percentage: number = 100,
    slippageBps?: number,
    useJito?: boolean
  ): Promise<TransactionResult | null> {
    const position = this.positions.get(positionId);
    if (!position) {
      return null;
    }

    const sellAmount = position.currentAmount * (percentage / 100);

    const result = await this.client.sellToken({
      tokenMint: position.tokenMint,
      amount: sellAmount,
      slippageBps,
      useJito,
    });

    if (result.success) {
      if (percentage >= 100) {
        position.status = 'closed';
        position.currentAmount = 0;
      } else {
        position.status = 'partial';
        position.currentAmount -= sellAmount;
      }

      this.emit('closed', position, result);
    }

    return result;
  }

  // Start position monitoring
  startMonitoring(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(async () => {
      await this.updatePositions();
    }, this.config.pollIntervalMs);
  }

  // Stop monitoring
  stopMonitoring(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Update all positions
  private async updatePositions(): Promise<void> {
    for (const position of this.positions.values()) {
      if (position.status === 'closed') continue;

      try {
        // Update current price
        const currentPrice = await this.getTokenPrice(position.tokenMint);
        const currentBalance = await this.client.getTokenBalance(position.tokenMint);

        position.currentPrice = currentPrice;
        position.currentAmount = currentBalance;
        position.pnlPercent = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
        position.pnlSol = (currentPrice - position.entryPrice) * position.currentAmount;

        this.emit('updated', position);

        // Check take profit
        if (
          position.takeProfitPercent &&
          position.pnlPercent >= position.takeProfitPercent &&
          this.config.autoCloseEnabled
        ) {
          this.emit('takeProfitHit', position);
          await this.closePosition(position.id, 100);
        }

        // Check stop loss
        if (
          position.stopLossPercent &&
          position.pnlPercent <= -position.stopLossPercent &&
          this.config.autoCloseEnabled
        ) {
          this.emit('stopLossHit', position);
          await this.closePosition(position.id, 100);
        }
      } catch (error) {
        console.error(`Error updating position ${position.id}:`, error);
      }
    }
  }

  // Get token price from Jupiter
  private async getTokenPrice(mint: string): Promise<number> {
    try {
      const response = await fetch(`https://price.jup.ag/v6/price?ids=${mint}`);
      const data = await response.json();
      return data.data[mint]?.price || 0;
    } catch {
      return 0;
    }
  }

  // Get all positions
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  // Get open positions only
  getOpenPositions(): Position[] {
    return this.getPositions().filter((p) => p.status === 'open');
  }

  // Get position by ID
  getPosition(id: string): Position | undefined {
    return this.positions.get(id);
  }

  // Calculate total PnL
  getTotalPnL(): { percent: number; sol: number } {
    const positions = this.getPositions();
    
    const totalEntrySol = positions.reduce(
      (sum, p) => sum + p.entryPrice * p.entryAmount,
      0
    );
    
    const totalCurrentSol = positions.reduce(
      (sum, p) => sum + p.currentPrice * p.currentAmount,
      0
    );

    const pnlSol = totalCurrentSol - totalEntrySol;
    const pnlPercent = totalEntrySol > 0 ? (pnlSol / totalEntrySol) * 100 : 0;

    return { percent: pnlPercent, sol: pnlSol };
  }
}

export default PositionManager;
