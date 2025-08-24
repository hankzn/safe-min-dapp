// docs/js/app.js
/* global ethers */
import { $, log, ensure0x, toWeiFromEthStr, zeroAddr, isHexAddress, sortLowercaseAddresses } from './utils.js';
import { connectWallet, getProvider, getSigner } from './wallet.js';
import { bindSafe, readThreshold, readNonce, getTransactionHash, approveHash, execTransaction } from './safe.js';
import { switchOrAdd, CHAINS } from './chains.js';
import { openConfirmTwoStep } from './confirm.js';

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
    return a.slice(2).padStart(64, '0') + '0'.repeat(64) + '01';
  });
  const sig = '0x' + chunks.join('');
  return { owners, sig };
}

function setAmountSymbolByChainId(chainIdNum) {
  let symbol = 'ETH';
  for (const k in CHAINS) {
    const c = CHAINS[k];
    if (parseInt(c.chainId, 16) === chainIdNum) {
      symbol = c.nativeCurrency?.symbol || symbol;
      break;
    }
  }
  const el = $('amountLabel');
  if (el) el.textContent = `Amount (${symbol})（自动换算为 wei）`;
}

const shortHex = (hex, left = 10, right = 6) => {
  const h = (hex || '').toString();
  if (h.length <= left + right) return h;
  return `${h.slice(0, left)}…${h.slice(-right)}`;
};

function chainInfoById(numId) {
  for (const k in CHAINS) {
    const c = CHAINS[k];
    if (parseInt(c.chainId, 16) === numId) return c;
  }
  return { chainId: '0x' + numId.toString(16), chainName: `Unknown (${numId})`, nativeCurrency:{symbol:'ETH'} };
}

async function onConnect() {
  const res = await connectWallet();
  if (!res) return;
  const cinfo = chainInfoById(Number(res.chainId));
  $('acct').textContent = `已连接：${res.account}`;
  $('chain').value = `${cinfo.chainName} (chainId=${Number(res.chainId)})`;
  setAmountSymbolByChainId(Number(res.chainId));
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
    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);
    const safeAddr = $('safe').value.trim();

    // 确保有 safeTxHash
    let h = $('safeTxHash').value.trim();
    if (!h) {
      const p = readParamsFromUI();
      if (!p.nonce) { p.nonce = await readNonce(); $('nonce').value = p.nonce; }
      h = await getTransactionHash(p);
      $('safeTxHash').value = h;
    }

    const rows = [
      ['网络', `${cinfo.chainName} (chainId=${chainIdNum})`],
      ['操作', 'approveHash'],
      ['Safe 地址', safeAddr],
      ['safeTxHash', h],
    ];

    const { proceed, txPromise } = await openConfirmTwoStep(
      '请确认：批准交易哈希（approveHash）',
      rows,
      () => approveHash(h) // 打开钱包并等待上链
    );

    if (!proceed) { log('已取消批准'); return; }

    log('已请求钱包，请在钱包里确认；确认后等待链上回执…');
    const rc = await txPromise;
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

    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);
    const symbol = cinfo.nativeCurrency?.symbol || 'ETH';

    // 计算/获取 safeTxHash
    let h = $('safeTxHash').value.trim();
    if (!h) {
      if (!p.nonce) { p.nonce = await readNonce(); $('nonce').value = p.nonce; }
      h = await getTransactionHash(p);
      $('safeTxHash').value = h;
    }

    const safeAddr = $('safe').value.trim();
    const amountHuman = ($('amountEth').value || '0').trim();
    const dataBytes = p.data === '0x' ? 0 : Math.max(0, (p.data.length - 2) / 2);
    const opName = (p.operation === 0 ? 'CALL(0)' : p.operation === 1 ? 'DELEGATECALL(1)' : String(p.operation));

    const rows = [
      ['网络', `${cinfo.chainName} (chainId=${chainIdNum})`],
      ['操作', 'execTransaction'],
      ['Safe 地址', safeAddr],
      ['收款地址 to', p.to],
      ['金额', `${amountHuman} ${symbol}（= ${p.valueWei} wei）`],
      ['data', dataBytes === 0 ? '0x（无附加数据）' : `${shortHex(p.data)}（${dataBytes} bytes）`],
      ['operation', opName],
      ['safeTxGas', p.safeTxGas],
      ['baseGas', p.baseGas],
      ['gasPrice', p.gasPrice],
      ['gasToken', p.gasToken],
      ['refundReceiver', p.refundReceiver],
      ['nonce', p.nonce || '(自动)'],
      ['safeTxHash', h],
      ['signatures 长度', String(sig.length)],
    ];

    const { proceed, txPromise } = await openConfirmTwoStep(
      '请确认：执行 Safe 交易（execTransaction）',
      rows,
      () => execTransaction(p, sig) // 打开钱包并等待上链
    );

    if (!proceed) { log('已取消执行'); return; }

    log('已请求钱包，请在钱包里确认；确认后等待链上回执…');
    const rc = await txPromise;
    log('✓ 执行成功：' + rc.transactionHash);
  } catch (e) { log(e.message || String(e), true); }
}

async function onSwitchNetwork() {
  const key = $('netSelect').value; // ethereum / arbitrum / bsc
  try {
    await switchOrAdd(key);
    const c = CHAINS[key];
    const cid = parseInt(c.chainId, 16);
    $('chain').value = `${c.chainName} (chainId=${cid})`;
    setAmountSymbolByChainId(cid);
    log('已切换到：' + c.chainName);
  } catch (e) { log(e.message || String(e), true); }
}

function main() {
  $('btnConnect').addEventListener('click', onConnect);
  $('btnRead').addEventListener('click', onRead);
  $('btnHash').addEventListener('click', onHash);
  $('btnApprove').addEventListener('click', onApprove);
  $('btnSig').addEventListener('click', onGenSig);
  $('btnExec').addEventListener('click', onExec);
  $('btnSwitch').addEventListener('click', onSwitchNetwork);

  if (window.ethereum) {
    window.ethereum.on('chainChanged', (hexId) => {
      const num = parseInt(hexId, 16);
      const cinfo = chainInfoById(num);
      $('chain').value = `${cinfo.chainName} (chainId=${num})`;
      setAmountSymbolByChainId(num);
      log('检测到网络切换：' + hexId);
    });
    window.ethereum.on('accountsChanged', (accts) => {
      if (accts && accts.length) $('acct').textContent = `已连接：${accts[0]}`;
    });
  }

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
