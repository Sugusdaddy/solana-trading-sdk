import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  SendOptions,
  Commitment,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { EventEmitter } from 'eventemitter3';

export interface TradingConfig {
  rpcUrl: string;
  rpcUrls?: string[];
  wsUrl?: string;
  privateKey: string;
  jitoEnabled?: boolean;
  jitoTipLamports?: number;
  jitoEndpoints?: string[];
  defaultSlippageBps?: number;
  priorityFeeLamports?: number;
  computeUnits?: number;
  commitment?: Commitment;
  maxRetries?: number;
  onTransaction?: (tx: TransactionResult) => void;
  onError?: (error: Error) => void;
}

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
  useJito?: boolean;
}

export interface TransactionResult {
  success: boolean;
  signature?: string;
  inputAmount: string;
  outputAmount: string;
  error?: string;
  latencyMs: number;
}

export interface Quote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  priceImpact: number;
  route: any[];
}

// Main Trading Client
export class TradingClient extends EventEmitter {
  private connection: Connection;
  private connections: Connection[] = [];
  private wallet: Keypair;
  private config: TradingConfig;
  private currentRpcIndex = 0;

  constructor(config: TradingConfig) {
    super();
    this.config = {
      defaultSlippageBps: 100,
      priorityFeeLamports: 10000,
      computeUnits: 200000,
      commitment: 'confirmed',
      maxRetries: 3,
      jitoTipLamports: 10000,
      jitoEndpoints: [
        'https://mainnet.block-engine.jito.wtf',
        'https://amsterdam.mainnet.block-engine.jito.wtf',
        'https://frankfurt.mainnet.block-engine.jito.wtf',
        'https://ny.mainnet.block-engine.jito.wtf',
        'https://tokyo.mainnet.block-engine.jito.wtf',
      ],
      ...config,
    };

    // Initialize wallet from private key
    this.wallet = Keypair.fromSecretKey(bs58.decode(config.privateKey));

    // Initialize connections
    this.connection = new Connection(config.rpcUrl, {
      commitment: this.config.commitment,
      confirmTransactionInitialTimeout: 60000,
    });

    // Add backup connections
    if (config.rpcUrls) {
      this.connections = config.rpcUrls.map(
        (url) => new Connection(url, { commitment: this.config.commitment })
      );
    }
    this.connections.unshift(this.connection);
  }

  // Get wallet public key
  get publicKey(): PublicKey {
    return this.wallet.publicKey;
  }

  // Get wallet address as string
  get address(): string {
    return this.wallet.publicKey.toBase58();
  }

  // Get SOL balance
  async getBalance(): Promise<number> {
    const balance = await this.connection.getBalance(this.wallet.publicKey);
    return balance / LAMPORTS_PER_SOL;
  }

  // Get token balance
  async getTokenBalance(mint: string): Promise<number> {
    const { TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
    
    const accounts = await this.connection.getParsedTokenAccountsByOwner(
      this.wallet.publicKey,
      { mint: new PublicKey(mint) }
    );

    if (accounts.value.length === 0) return 0;

    const balance = accounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance || 0;
  }

  // Rotate to next RPC endpoint
  private rotateRpc(): void {
    this.currentRpcIndex = (this.currentRpcIndex + 1) % this.connections.length;
    this.connection = this.connections[this.currentRpcIndex];
  }

  // Get current connection
  getConnection(): Connection {
    return this.connection;
  }

  // Fetch quote from Jupiter
  async getQuote(params: SwapParams): Promise<Quote | null> {
    const { inputMint, outputMint, amount, slippageBps } = params;
    const slippage = slippageBps || this.config.defaultSlippageBps || 100;

    try {
      // Get token decimals
      const decimals = inputMint === 'So11111111111111111111111111111111111111112' ? 9 : 6;
      const inputAmount = Math.floor(amount * Math.pow(10, decimals)).toString();

      const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${inputAmount}&` +
        `slippageBps=${slippage}`
      );

      if (!response.ok) {
        throw new Error(`Quote failed: ${response.status}`);
      }

      const data = await response.json();

      return {
        inputMint,
        outputMint,
        inputAmount: data.inAmount,
        outputAmount: data.outAmount,
        priceImpact: parseFloat(data.priceImpactPct || '0'),
        route: data.routePlan || [],
      };
    } catch (error) {
      console.error('Quote error:', error);
      return null;
    }
  }

  // Execute swap
  async swap(params: SwapParams): Promise<TransactionResult> {
    const startTime = Date.now();
    const { useJito } = params;

    try {
      // Get quote
      const quote = await this.getQuote(params);
      if (!quote) {
        return {
          success: false,
          inputAmount: params.amount.toString(),
          outputAmount: '0',
          error: 'Failed to get quote',
          latencyMs: Date.now() - startTime,
        };
      }

      // Get swap transaction
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: this.config.priorityFeeLamports,
          dynamicComputeUnitLimit: true,
        }),
      });

      if (!swapResponse.ok) {
        throw new Error('Failed to create swap transaction');
      }

      const { swapTransaction } = await swapResponse.json();

      // Deserialize and sign transaction
      const txBuffer = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(txBuffer);
      transaction.sign([this.wallet]);

      let signature: string;

      if (useJito && this.config.jitoEnabled) {
        // Submit via Jito
        signature = await this.submitJitoBundle(transaction);
      } else {
        // Submit directly
        signature = await this.sendTransaction(transaction);
      }

      const latencyMs = Date.now() - startTime;

      const result: TransactionResult = {
        success: true,
        signature,
        inputAmount: params.amount.toString(),
        outputAmount: quote.outputAmount,
        latencyMs,
      };

      this.emit('swap', result);
      this.config.onTransaction?.(result);

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      const result: TransactionResult = {
        success: false,
        inputAmount: params.amount.toString(),
        outputAmount: '0',
        error: errorMessage,
        latencyMs: Date.now() - startTime,
      };

      this.emit('error', error);
      this.config.onError?.(error instanceof Error ? error : new Error(errorMessage));

      return result;
    }
  }

  // Buy token (SOL → Token)
  async buyToken(params: {
    tokenMint: string;
    amountSol: number;
    slippageBps?: number;
    useJito?: boolean;
  }): Promise<TransactionResult> {
    return this.swap({
      inputMint: 'So11111111111111111111111111111111111111112',
      outputMint: params.tokenMint,
      amount: params.amountSol,
      slippageBps: params.slippageBps,
      useJito: params.useJito,
    });
  }

  // Sell token (Token → SOL)
  async sellToken(params: {
    tokenMint: string;
    amount: number;
    slippageBps?: number;
    useJito?: boolean;
  }): Promise<TransactionResult> {
    return this.swap({
      inputMint: params.tokenMint,
      outputMint: 'So11111111111111111111111111111111111111112',
      amount: params.amount,
      slippageBps: params.slippageBps,
      useJito: params.useJito,
    });
  }

  // Sell percentage of token holdings
  async sellPercentage(params: {
    tokenMint: string;
    percentage: number;
    slippageBps?: number;
    useJito?: boolean;
  }): Promise<TransactionResult> {
    const balance = await this.getTokenBalance(params.tokenMint);
    const sellAmount = balance * (params.percentage / 100);

    if (sellAmount <= 0) {
      return {
        success: false,
        inputAmount: '0',
        outputAmount: '0',
        error: 'No tokens to sell',
        latencyMs: 0,
      };
    }

    return this.sellToken({
      tokenMint: params.tokenMint,
      amount: sellAmount,
      slippageBps: params.slippageBps,
      useJito: params.useJito,
    });
  }

  // Send transaction with retries
  private async sendTransaction(transaction: VersionedTransaction): Promise<string> {
    const serialized = transaction.serialize();
    let lastError: Error | null = null;

    for (let i = 0; i < (this.config.maxRetries || 3); i++) {
      try {
        const signature = await this.connection.sendRawTransaction(serialized, {
          skipPreflight: true,
          maxRetries: 2,
        });

        // Wait for confirmation
        const confirmation = await this.connection.confirmTransaction(
          signature,
          this.config.commitment
        );

        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        return signature;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.rotateRpc();
      }
    }

    throw lastError || new Error('Transaction failed after retries');
  }

  // Submit transaction via Jito bundle
  private async submitJitoBundle(transaction: VersionedTransaction): Promise<string> {
    const serialized = Buffer.from(transaction.serialize()).toString('base64');
    const endpoints = this.config.jitoEndpoints || [];

    // Submit to all Jito endpoints in parallel
    const promises = endpoints.map(async (endpoint) => {
      try {
        const response = await fetch(`${endpoint}/api/v1/bundles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sendBundle',
            params: [[serialized]],
          }),
        });

        if (!response.ok) return null;

        const data = await response.json();
        return data.result;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(promises);
    const bundleId = results.find((r) => r !== null);

    if (!bundleId) {
      throw new Error('Failed to submit Jito bundle');
    }

    // Get transaction signature from bundle
    // In production, would poll for bundle status
    return bundleId;
  }

  // Get recent blockhash
  async getRecentBlockhash(): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash(this.config.commitment);
    return blockhash;
  }
}

// Export for module
export default TradingClient;
