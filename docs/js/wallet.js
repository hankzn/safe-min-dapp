// docs/js/wallet.js
/* global ethers */
import { log } from './utils.js';

let provider = null;
let signer = null;

export async function connectWallet() {
  if (!window.ethereum) {
    alert('找不到钱包（MetaMask/兼容钱包）');
    return null;
  }
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  provider = new ethers.providers.Web3Provider(window.ethereum);
  signer = provider.getSigner();
  const account = await signer.getAddress();
  const net = await provider.getNetwork();
  return { account, chainId: net.chainId };
}

export function getProvider() { return provider; }
export function getSigner() { return signer; }
