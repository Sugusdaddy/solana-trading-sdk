/**
 * Example: Simple swap using the trading SDK
 */
import { TradingClient } from '../src';

async function main() {
  // Initialize client
  const client = new TradingClient({
    rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
    privateKey: process.env.PRIVATE_KEY!,
    jitoEnabled: true,
    jitoTipLamports: 10000,
    defaultSlippageBps: 100,
  });

  console.log(`Wallet: ${client.address}`);

  // Check balance
  const balance = await client.getBalance();
  console.log(`SOL Balance: ${balance.toFixed(4)} SOL`);

  // Get quote for SOL -> USDC
  const quote = await client.getQuote({
    inputMint: 'So11111111111111111111111111111111111111112', // SOL
    outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    amount: 0.1,
    slippageBps: 100,
  });

  if (quote) {
    console.log(`\nQuote: ${0.1} SOL -> ${parseFloat(quote.outputAmount) / 1e6} USDC`);
    console.log(`Price Impact: ${quote.priceImpact}%`);
  }

  // Execute swap (uncomment to actually swap)
  // const result = await client.swap({
  //   inputMint: 'So11111111111111111111111111111111111111112',
  //   outputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  //   amount: 0.1,
  //   useJito: true,
  // });
  //
  // if (result.success) {
  //   console.log(`Swap successful! TX: ${result.signature}`);
  // } else {
  //   console.log(`Swap failed: ${result.error}`);
  // }
}

main().catch(console.error);
