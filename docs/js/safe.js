// docs/js/safe.js
/* global ethers */
import { ABI } from './abi.js';

let contract = null;

export function bindSafe(addr, signerOrProvider) {
  if (!addr) throw new Error('缺少 Safe 地址');
  contract = new ethers.Contract(addr, ABI, signerOrProvider);
  return contract;
}

export function getContract() {
  if (!contract) throw new Error('尚未绑定 Safe 合约');
  return contract;
}

export async function readThreshold() {
  return (await getContract().getThreshold()).toString();
}

export async function readNonce() {
  return (await getContract().nonce()).toString();
}

export async function getTransactionHash(p) {
  // 需要保证所有数值都是可被 ethers 识别的类型（string/BigNumber/number）
  return await getContract().getTransactionHash(
    p.to, p.valueWei, p.data, p.operation,
    p.safeTxGas, p.baseGas, p.gasPrice,
    p.gasToken, p.refundReceiver, p.nonce
  );
}

export async function approveHash(hash) {
  const tx = await getContract().approveHash(hash);
  return tx.wait();
}

export async function execTransaction(p, signatures) {
  const tx = await getContract().execTransaction(
    p.to, p.valueWei, p.data, p.operation,
    p.safeTxGas, p.baseGas, p.gasPrice,
    p.gasToken, p.refundReceiver, signatures,
    { value: 0 }
  );
  return tx.wait();
}
