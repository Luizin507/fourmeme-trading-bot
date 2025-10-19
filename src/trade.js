import { ethers } from 'ethers';
import { FourTrading } from '@fnzero/four-trading-sdk';
import { config } from './config.js';
import { loadAbi } from "./abi.js";

// --- Setup ---
await loadAbi();
const provider = new ethers.JsonRpcProvider(config.RPC_HTTP_URL);
const wallet = new ethers.Wallet(config.PRIVATE_KEY, provider);

const FourMemeABI = [
  'function buyTokenAMAP(address token,uint256 funds,uint256 minAmount) payable',
  'function sellToken(address token,uint256 tokenQty)',
  'function getBuyPrice(address token, uint256 funds) view returns (uint256)'
];
const ERC20ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

const fourContract = new ethers.Contract(config.FOUR_CONTRACT_ADDRESS, FourMemeABI, wallet);
const IFour = new ethers.Interface(FourMemeABI);

const trading = new FourTrading({
  rpcUrl: config.RPC_HTTP_URL,
  wssUrl: config.WSS_URL,
  privateKey: config.PRIVATE_KEY
});

const purchasedTokens = new Set();

// --- Utility ---
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function networkGasPrice() {
  try {
    return ethers.parseUnits(config.GAS_PRICE, 'gwei');
  } catch {
    return ethers.parseUnits('2', 'gwei');
  }
}

async function getWalletBalance() {
  return provider.getBalance(wallet.address);
}

// --- Trade Logic ---
async function sendBuyWithReplacements(tokenAddress, amountWei) {
  const minAmount = 100n;
  const data = IFour.encodeFunctionData('buyTokenAMAP', [tokenAddress, amountWei, minAmount]);
  const gasPrice = await networkGasPrice();
  const nonce = await wallet.getNonce();

  const txReq = {
    to: config.FOUR_CONTRACT_ADDRESS,
    data,
    value: amountWei,
    gasLimit: 500000n,
    gasPrice,
    nonce
  };

  try {
    const tx = await wallet.sendTransaction(txReq);
    const rc = await tx.wait();
    console.log(`✅ Buy confirmed in block ${rc.blockNumber}`);
    return rc;
  } catch (e) {
    console.error('✗ Buy failed:', e.message || e);
    return null;
  }
}

async function buyToken(tokenAddress) {
  const amountWei = ethers.parseEther(config.BUY_AMOUNT);
  console.log(`\n🟢 Buying ${config.BUY_AMOUNT} BNB of ${tokenAddress}`);
  const rcpt = await sendBuyWithReplacements(tokenAddress, amountWei);
  if (!rcpt) return false;
  return await approveToken(tokenAddress);
}

async function approveToken(tokenAddress) {
  const token = new ethers.Contract(tokenAddress, ERC20ABI, wallet);
  const gasPrice = ethers.parseUnits(config.APPROVE_GAS_PRICE, 'gwei');
  try {
    const tx = await token.approve(config.FOUR_CONTRACT_ADDRESS, ethers.MaxUint256, {
      gasLimit: 120000n,
      gasPrice
    });
    await tx.wait();
    console.log('✅ Approval successful');
    return true;
  } catch (err) {
    console.error('✗ Approval failed:', err.message || err);
    return false;
  }
}

async function sellToken(tokenAddress, attempt = 1) {
  const token = new ethers.Contract(tokenAddress, ERC20ABI, wallet);
  try {
    const decimals = await token.decimals().catch(() => 18);
    const balance = await token.balanceOf(wallet.address);
    if (balance === 0n) {
      console.log('No tokens to sell');
      return false;
    }

    const amountToSell = (balance * BigInt(config.SELL_SLIPPAGE_PERCENTAGE)) / 100n;
    let gasPrice = ethers.parseUnits(config.GAS_PRICE, 'gwei');
    for (let i = 1; i < attempt; i++) {
      gasPrice = (gasPrice * 3n) / 2n;
    }

    console.log(`🔴 Selling ${ethers.formatUnits(amountToSell, decimals)} tokens... (Attempt ${attempt})`);
    const tx = await fourContract.sellToken(tokenAddress, amountToSell, {
      gasLimit: 900000n,
      gasPrice
    });
    const rc = await tx.wait();
    console.log(`✓ Sell confirmed in block ${rc.blockNumber}`);
    return true;
  } catch (error) {
    console.error(`✗ Sell failed (attempt ${attempt}):`, error.message || error);
    return false;
  }
}

async function shouldBuy(tokenAddress) {
  try {
    if (tokenAddress.toLowerCase().startsWith('0x4444')) return false;

    const tokenInfo = await trading.getTokenInfo(tokenAddress);
    const launchTime = new Date(Number(tokenInfo.launchTime) * 1000);
    const now = new Date();
    const diff = BigInt(now.getTime() - launchTime.getTime()) / 1000n;
    const fundsRaised = Number(ethers.formatEther(tokenInfo.funds));

    return diff > 20n && diff < 200n && fundsRaised > 2;
  } catch {
    return false;
  }
}

async function handleTokenTrade(token) {
  if (purchasedTokens.has(token)) return;
  purchasedTokens.add(token);

  const balanceBefore = await getWalletBalance();
  const bought = await buyToken(token);
  if (!bought || config.ONLY_BUY) return;

  await delay(config.SELL_DELAY * 1000);
  let sold = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    sold = await sellToken(token, attempt);
    if (sold) break;
    if (attempt < 5) {
      console.log('Retrying sell in 3 seconds...');
      await delay(3000);
    }
  }

  const balanceAfter = await getWalletBalance();
  const diff = Number(ethers.formatEther(balanceAfter - balanceBefore));
  const percent = (diff * 100 / parseFloat(config.BUY_AMOUNT)).toFixed(2);
  if (diff >= 0) {
    console.log(`💰 Profit: +${diff.toFixed(6)} BNB (+${percent}%)`);
  } else {
    console.log(`🔻 Loss: ${diff.toFixed(6)} BNB (${percent}%)`);
  }

  if (!sold) console.error(`❌ All sell attempts failed for ${token}`);
}

export { trading, handleTokenTrade, wallet, provider };
