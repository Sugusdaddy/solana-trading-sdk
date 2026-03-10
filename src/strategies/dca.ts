import { Connection, PublicKey, Keypair } from '@solana/web3.js';

export interface DCAConfig {
  inputMint: PublicKey;
  outputMint: PublicKey;
  totalAmount: number;
  intervals: number;
  intervalMs: number;
  minPrice?: number;
  maxPrice?: number;
}

export interface DCAOrder {
  id: string;
  config: DCAConfig;
  executedIntervals: number;
  totalSpent: number;
  totalReceived: number;
  averagePrice: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  nextExecutionAt: number;
}

export class DCAStrategy {
  private connection: Connection;
  private wallet: Keypair;
  private orders: Map<string, DCAOrder> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(connection: Connection, wallet: Keypair) {
    this.connection = connection;
    this.wallet = wallet;
  }

  async createOrder(config: DCAConfig): Promise<DCAOrder> {
    const id = `dca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    
    const order: DCAOrder = {
      id,
      config,
      executedIntervals: 0,
      totalSpent: 0,
      totalReceived: 0,
      averagePrice: 0,
      status: 'active',
      nextExecutionAt: Date.now() + config.intervalMs,
    };

    this.orders.set(id, order);
    this.scheduleNextExecution(order);

    return order;
  }

  private scheduleNextExecution(order: DCAOrder): void {
    if (order.status !== 'active') return;
    if (order.executedIntervals >= order.config.intervals) {
      order.status = 'completed';
      return;
    }

    const timer = setTimeout(async () => {
      await this.executeInterval(order);
    }, order.config.intervalMs);

    this.timers.set(order.id, timer);
  }

  private async executeInterval(order: DCAOrder): Promise<void> {
    const amountPerInterval = order.config.totalAmount / order.config.intervals;
    
    try {
      // Check price bounds
      const currentPrice = await this.getCurrentPrice(
        order.config.inputMint,
        order.config.outputMint
      );

      if (order.config.minPrice && currentPrice < order.config.minPrice) {
        console.log(`DCA ${order.id}: Price ${currentPrice} below min ${order.config.minPrice}, skipping`);
        this.scheduleNextExecution(order);
        return;
      }

      if (order.config.maxPrice && currentPrice > order.config.maxPrice) {
        console.log(`DCA ${order.id}: Price ${currentPrice} above max ${order.config.maxPrice}, skipping`);
        this.scheduleNextExecution(order);
        return;
      }

      // Execute swap
      const received = await this.executeSwap(
        order.config.inputMint,
        order.config.outputMint,
        amountPerInterval
      );

      // Update order stats
      order.executedIntervals++;
      order.totalSpent += amountPerInterval;
      order.totalReceived += received;
      order.averagePrice = order.totalSpent / order.totalReceived;
      order.nextExecutionAt = Date.now() + order.config.intervalMs;

      console.log(`DCA ${order.id}: Interval ${order.executedIntervals}/${order.config.intervals} executed`);

      this.scheduleNextExecution(order);
    } catch (error) {
      console.error(`DCA ${order.id} execution failed:`, error);
      this.scheduleNextExecution(order);
    }
  }

  private async getCurrentPrice(inputMint: PublicKey, outputMint: PublicKey): Promise<number> {
    // Would fetch from Jupiter/DEX
    return 0;
  }

  private async executeSwap(
    inputMint: PublicKey,
    outputMint: PublicKey,
    amount: number
  ): Promise<number> {
    // Would execute via Jupiter
    return 0;
  }

  pauseOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'paused';
      const timer = this.timers.get(orderId);
      if (timer) clearTimeout(timer);
    }
  }

  resumeOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order && order.status === 'paused') {
      order.status = 'active';
      this.scheduleNextExecution(order);
    }
  }

  cancelOrder(orderId: string): void {
    const order = this.orders.get(orderId);
    if (order) {
      order.status = 'cancelled';
      const timer = this.timers.get(orderId);
      if (timer) clearTimeout(timer);
    }
  }

  getOrder(orderId: string): DCAOrder | undefined {
    return this.orders.get(orderId);
  }

  getAllOrders(): DCAOrder[] {
    return Array.from(this.orders.values());
  }
}
