export interface Trade {
  id: string;
  timestamp: Date;
  type: 'buy' | 'sell';
  mint: string;
  symbol: string;
  amount: number;
  price: number;
  value: number;
  fee: number;
  pnl?: number;
  signature: string;
}

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  currentDrawdown: number;
}

export class TradeAnalytics {
  private trades: Trade[] = [];
  private peakEquity: number = 0;
  private currentEquity: number = 0;

  constructor(initialEquity: number = 0) {
    this.currentEquity = initialEquity;
    this.peakEquity = initialEquity;
  }

  recordTrade(trade: Trade): void {
    this.trades.push(trade);
    
    if (trade.pnl) {
      this.currentEquity += trade.pnl;
      if (this.currentEquity > this.peakEquity) {
        this.peakEquity = this.currentEquity;
      }
    }
  }

  getMetrics(): PerformanceMetrics {
    const tradesWithPnl = this.trades.filter(t => t.pnl !== undefined);
    const winningTrades = tradesWithPnl.filter(t => t.pnl! > 0);
    const losingTrades = tradesWithPnl.filter(t => t.pnl! < 0);

    const totalPnl = tradesWithPnl.reduce((sum, t) => sum + t.pnl!, 0);
    const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl!, 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl!, 0));

    const returns = this.calculateReturns();
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length || 0;
    const stdDev = this.calculateStdDev(returns);

    return {
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: tradesWithPnl.length > 0 ? winningTrades.length / tradesWithPnl.length : 0,
      totalPnl,
      averageWin: winningTrades.length > 0 ? totalWins / winningTrades.length : 0,
      averageLoss: losingTrades.length > 0 ? totalLosses / losingTrades.length : 0,
      profitFactor: totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0,
      sharpeRatio: stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0,
      maxDrawdown: this.calculateMaxDrawdown(),
      currentDrawdown: (this.peakEquity - this.currentEquity) / this.peakEquity,
    };
  }

  private calculateReturns(): number[] {
    const returns: number[] = [];
    for (let i = 1; i < this.trades.length; i++) {
      if (this.trades[i].pnl && this.trades[i - 1].value) {
        returns.push(this.trades[i].pnl! / this.trades[i - 1].value);
      }
    }
    return returns;
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - avg, 2));
    return Math.sqrt(squareDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  private calculateMaxDrawdown(): number {
    let maxDrawdown = 0;
    let peak = 0;
    let equity = 0;

    for (const trade of this.trades) {
      if (trade.pnl) {
        equity += trade.pnl;
        if (equity > peak) peak = equity;
        const drawdown = (peak - equity) / peak;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  getTradeHistory(limit?: number): Trade[] {
    const sorted = [...this.trades].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  exportToCSV(): string {
    const headers = 'id,timestamp,type,symbol,amount,price,value,fee,pnl,signature';
    const rows = this.trades.map(t => 
      `${t.id},${t.timestamp.toISOString()},${t.type},${t.symbol},${t.amount},${t.price},${t.value},${t.fee},${t.pnl || ''},${t.signature}`
    );
    return [headers, ...rows].join('\n');
  }
}
