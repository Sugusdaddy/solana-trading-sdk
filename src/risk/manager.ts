import { PublicKey } from '@solana/web3.js';

export interface RiskLimits {
  maxPositionSize: number;
  maxTotalExposure: number;
  maxDailyLoss: number;
  maxSingleTradeLoss: number;
  maxLeverage: number;
  cooldownAfterLoss: number; // ms
}

export interface PositionRisk {
  positionId: string;
  mint: string;
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  riskScore: number;
}

export class RiskManager {
  private limits: RiskLimits;
  private dailyPnl: number = 0;
  private lastLossTime: number = 0;
  private positions: Map<string, PositionRisk> = new Map();

  constructor(limits: RiskLimits) {
    this.limits = limits;
  }

  canOpenPosition(size: number, price: number): { allowed: boolean; reason?: string } {
    const positionValue = size * price;

    // Check position size limit
    if (positionValue > this.limits.maxPositionSize) {
      return { allowed: false, reason: `Position size $${positionValue} exceeds limit $${this.limits.maxPositionSize}` };
    }

    // Check total exposure
    const currentExposure = this.getTotalExposure();
    if (currentExposure + positionValue > this.limits.maxTotalExposure) {
      return { allowed: false, reason: 'Would exceed total exposure limit' };
    }

    // Check daily loss limit
    if (this.dailyPnl < -this.limits.maxDailyLoss) {
      return { allowed: false, reason: 'Daily loss limit reached' };
    }

    // Check cooldown after loss
    if (Date.now() - this.lastLossTime < this.limits.cooldownAfterLoss) {
      const remaining = Math.ceil((this.limits.cooldownAfterLoss - (Date.now() - this.lastLossTime)) / 1000);
      return { allowed: false, reason: `Cooldown active: ${remaining}s remaining` };
    }

    return { allowed: true };
  }

  getTotalExposure(): number {
    return Array.from(this.positions.values()).reduce((sum, p) => sum + (p.size * p.currentPrice), 0);
  }

  calculatePositionSize(
    availableCapital: number,
    riskPerTrade: number,
    entryPrice: number,
    stopLoss: number
  ): number {
    // Kelly Criterion inspired position sizing
    const riskAmount = availableCapital * riskPerTrade;
    const priceRisk = Math.abs(entryPrice - stopLoss) / entryPrice;
    const positionSize = riskAmount / (entryPrice * priceRisk);
    
    // Apply max position size limit
    return Math.min(positionSize, this.limits.maxPositionSize / entryPrice);
  }

  recordTrade(pnl: number): void {
    this.dailyPnl += pnl;
    if (pnl < 0) {
      this.lastLossTime = Date.now();
    }
  }

  resetDailyPnl(): void {
    this.dailyPnl = 0;
  }

  getStats(): {
    dailyPnl: number;
    totalExposure: number;
    positionCount: number;
    riskUtilization: number;
  } {
    return {
      dailyPnl: this.dailyPnl,
      totalExposure: this.getTotalExposure(),
      positionCount: this.positions.size,
      riskUtilization: this.getTotalExposure() / this.limits.maxTotalExposure,
    };
  }
}
