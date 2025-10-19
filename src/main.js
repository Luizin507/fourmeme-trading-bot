import { trading, handleTokenTrade, wallet, provider } from './trade.js';

async function getBalanceInfo() {
  const bal = await provider.getBalance(wallet.address);
  console.log(`--- Wallet Info ---`);
  console.log(`Address: ${wallet.address}`);
  console.log(`BNB Balance: ${ethers.formatEther(bal)} BNB`);
  console.log(`-------------------\n`);
}

async function main() {
  await getBalanceInfo();

  trading.onTokenPurchase(async (event) => {
    const token = event.token;
    if (!token) return;
    handleTokenTrade(token);
  });

  console.log('🚀 Bot started. Listening for token purchases...');
}

main().catch(console.error);
