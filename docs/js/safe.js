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

export async function readOwners() {
  const arr = await getContract().getOwners();
  return arr.map(a => a.toLowerCase());
}

export async function isOwner(addr) {
  return await getContract().isOwner(addr);
}

export async function approvedValue(owner, hash) {
  // returns string or BigNumber; normalize to boolean
  const v = await getContract().approvedHashes(owner, hash);
  return !ethers.BigNumber.from(v).isZero();
}

export async function getApprovalsForHash(hash) {
  const owners = await readOwners();
  const flags = await Promise.all(owners.map(o => approvedValue(o, hash)));
  const approvedOwners = owners.filter((_, i) => flags[i]);
  const map = {};
  owners.forEach((o, i) => { map[o] = !!flags[i]; });
  return { owners, approvedOwners, map };
}

export async function getTransactionHash(p) {
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
