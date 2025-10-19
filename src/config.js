import dotenv from 'dotenv';
dotenv.config();

export const config = {
  BUY_AMOUNT: process.env.BUY_AMOUNT || '0.02',
  SELL_DELAY: parseInt(process.env.SELL_DELAY) || 15,
  GAS_PRICE: process.env.GAS_PRICE || '0.11',
  APPROVE_GAS_PRICE: process.env.APPROVE_GAS_PRICE || '0.11',
  SELL_SLIPPAGE_PERCENTAGE: parseInt(process.env.SELL_SLIPPAGE_PERCENTAGE) || 100,
  ONLY_BUY: process.env.ONLY_BUY === 'true',

  RPC_HTTP_URL: process.env.RPC_HTTP_URL,
  WSS_URL: process.env.WSS_URL,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  FOUR_CONTRACT_ADDRESS: process.env.FOUR_CONTRACT_ADDRESS
};