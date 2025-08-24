// docs/js/app.js
/* global ethers */
import { $, log, ensure0x, toWeiFromEthStr, zeroAddr, isHexAddress, sortLowercaseAddresses } from './utils.js';
import { connectWallet, getProvider, getSigner } from './wallet.js';
import { bindSafe, readThreshold, readNonce, getTransactionHash, approveHash, execTransaction } from './safe.js';

function readParamsFromUI() {
  return {
    to: $('to').value.trim(),
    valueWei: toWeiFromEthStr($('amountEth').value || '0'),
    data: ensure0x($('data').value || '0x'),
    operation: parseInt(($('operation').value || '0').trim(), 10),
    safeTxGas: ethers.BigNumber.from(($('safeTxGas').value || '0').trim()).toString(),
    baseGas: ethers.BigNumber.from(($('baseGas').value || '0').trim()).toString(),
    gasPrice: ethers.BigNumber.from(($('gasPrice').value || '0').trim()).toString(),
    gasToken: $('gasToken').value || zeroAddr(),
    refundReceiver: $('refundReceiver').value || zeroAddr(),
    nonce: ($('nonce').value || '').trim()
  };
}

function genPrevalidatedSignatures(ownersStr) {
  if (!ownersStr) throw new Error('请填写 Owner 地址列表');
  const owners = sortLowercaseAddresses(ownersStr.split(','));

  const chunks = owners.map(a => {
    if (!isHexAddress(a)) throw new Error('非法地址：' + a);
    // 32字节地址（去0x并左填充），+ 32字节 r/s 为 0，+ v=01（“预验证”）
    return a.slice(2).padStart(64, '0') + '0'.repeat(64) + '01';
  });
  const sig = '0x' + chunks.join('');
  return { owners, sig };
}

async function onConnect() {
  const res = await connectWallet();
  if (!res) return;
  $('acct').textContent = `已连接：${res.account}`;
  $('chain').value = `chainId=${res.chainId}`;

  const addr = $('safe').value.trim();
  if (!addr) { log('请先填写 Safe 地址', true); return; }
  bindSafe(addr, getSigner() || getProvider());
  log('已绑定 Safe 合约：' + addr);
}

async function onRead() {
  try {
    const th = await readThreshold();
    $('threshold').value = th;
    let n = $('nonce').value.trim();
    if (!n) { n = await readNonce(); $('nonce').value = n; }
    log({ threshold: th, nonce: n });
  } catch (e) { log(e.message || String(e), true); }
}

async function onHash() {
  try {
    const p = readParamsFromUI();
    if (!p.nonce) { p.nonce = await readNonce(); $('nonce').value = p.nonce; }
    const h = await getTransactionHash(p);
    $('safeTxHash').value = h;
    log({ safeTxHash: h });
  } catch (e) { log(e.message || String(e), true); }
}

async function onApprove() {
  try {
    const h = $('safeTxHash').value.trim();
    if (!h) { log('请先计算 safeTxHash', true); return; }
    const rc = await approveHash(h);
    log('approveHash 确认：' + rc.transactionHash);
  } catch (e) { log(e.message || String(e), true); }
}

function onGenSig() {
  try {
    const ownersInput = $('owners').value.trim();
    const { owners, sig } = genPrevalidatedSignatures(ownersInput);
    $('signatures').value = sig;
    log({ owners_sorted: owners, signatures_len: sig.length });
  } catch (e) { log(e.message || String(e), true); }
}

async function onExec() {
  try {
    const p = readParamsFromUI();
    const sig = $('signatures').value.trim();
    if (!sig) { log('请先生成 signatures', true); return; }
    const rc = await execTransaction(p, sig);
    log('✓ 执行成功：' + rc.transactionHash);
  } catch (e) { log(e.message || String(e), true); }
}

function main() {
  // 事件绑定
  $('btnConnect').addEventListener('click', onConnect);
  $('btnRead').addEventListener('click', onRead);
  $('btnHash').addEventListener('click', onHash);
  $('btnApprove').addEventListener('click', onApprove);
  $('btnSig').addEventListener('click', onGenSig);
  $('btnExec').addEventListener('click', onExec);
  $('safe').addEventListener('change', () => {
    const addr = $('safe').value.trim();
    if (!addr) { log('请先填写 Safe 地址', true); return; }
    try {
      bindSafe(addr, getSigner() || getProvider());
      log('已绑定 Safe 合约：' + addr);
    } catch (e) { log(e.message || String(e), true); }
  });
}

document.addEventListener('DOMContentLoaded', main);
