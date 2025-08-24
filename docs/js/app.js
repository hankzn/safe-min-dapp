// docs/js/app.js
/* global ethers */
import { $, log, ensure0x, toWeiFromEthStr, zeroAddr, isHexAddress, sortLowercaseAddresses } from './utils.js';
import { connectWallet, getProvider, getSigner } from './wallet.js';
import { bindSafe, readThreshold, readNonce, getTransactionHash, approveHash, execTransaction } from './safe.js';
import { switchOrAdd, CHAINS } from './chains.js';
import { openConfirmTwoStep } from './confirm.js';

// 状态：地址/金额确认，高级参数锁定
let toConfirmed = false;
let amountConfirmed = false;
let advancedUnlocked = false;
const ADV_IDS = ['operation','safeTxGas','baseGas','gasPrice','gasToken','refundReceiver'];

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

// ===== 地址确认 =====
function updateToStatus() {
  const st = $('toStatus');
  const input = $('to');
  if (toConfirmed) {
    input.readOnly = true;
    input.classList.add('confirmed');
    st.textContent = '已确认收款地址（锁定，需更改请刷新页面）';
    st.className = 'hint status-ok';
  } else {
    input.readOnly = false;
    input.classList.remove('confirmed');
    st.textContent = '请填写后点击“确认地址”，未确认将无法计算/执行';
    st.className = 'hint status-warn';
  }
}
function confirmTo() {
  const addr = $('to').value.trim();
  if (!isHexAddress(addr)) {
    log('收款地址格式不正确：需 0x 开头的 40 位十六进制地址', true);
    return;
  }
  toConfirmed = true;
  updateToStatus();
  log('已确认收款地址：' + addr);
}

// ===== 金额确认 =====
function updateAmountStatus() {
  const st = $('amountStatus');
  const input = $('amountEth');
  if (amountConfirmed) {
    input.readOnly = true;
    input.classList.add('confirmed');
    st.textContent = '已确认金额（锁定，需更改请刷新页面）';
    st.className = 'hint status-ok';
  } else {
    input.readOnly = false;
    input.classList.remove('confirmed');
    st.textContent = '请填写后点击“确认金额”，未确认将无法计算/执行';
    st.className = 'hint status-warn';
  }
}
function confirmAmount() {
  const val = ($('amountEth').value || '').trim();
  try {
    const wei = ethers.utils.parseEther(val); // 校验格式（>=0 的 18 位小数）
    if (wei.lt(0)) throw new Error('金额必须 >= 0');
  } catch (e) {
    log('金额格式不正确：请输入形如 0.001 的数字（最多 18 位小数）', true);
    return;
  }
  amountConfirmed = true;
  updateAmountStatus();
  log('已确认金额：' + val);
}

// ===== 高级参数锁/解锁 =====
function setAdvancedReadonly(readonly) {
  ADV_IDS.forEach(id => { const el = $(id); if (el) el.readOnly = readonly; });
}
function toggleAdvanced() {
  const btn = $('btnToggleAdvanced');
  if (!advancedUnlocked) {
    const ok = window.confirm('解锁高级参数可能导致交易失败或资金风险。\n仅在完全理解参数意义时才修改。\n是否确认解锁？');
    if (!ok) return;
    advancedUnlocked = true;
    setAdvancedReadonly(false);
    if (btn) btn.textContent = '锁定高级参数';
    log('已解锁高级参数，请谨慎修改！');
  } else {
    advancedUnlocked = false;
    setAdvancedReadonly(true);
    if (btn) btn.textContent = '解锁高级参数';
    log('已锁定高级参数。');
  }
}

// ===== 业务流程 =====
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
    if (!toConfirmed) { log('未确认收款地址：请先点击“确认地址”。', true); return; }
    if (!amountConfirmed) { log('未确认金额：请先点击“确认金额”。', true); return; }
    const p = readParamsFromUI();
    if (!p.nonce) { p.nonce = await readNonce(); $('nonce').value = p.nonce; }
    const h = await getTransactionHash(p);
    $('safeTxHash').value = h;
    log({ safeTxHash: h });
  } catch (e) { log(e.message || String(e), true); }
}

async function onApprove() {
  try {
    if (!toConfirmed) { log('未确认收款地址：请先点击“确认地址”。', true); return; }
    if (!amountConfirmed) { log('未确认金额：请先点击“确认金额”。', true); return; }

    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);
    const safeAddr = $('safe').value.trim();

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
      () => approveHash(h)
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
    if (!toConfirmed) { log('未确认收款地址：请先点击“确认地址”。', true); return; }
    if (!amountConfirmed) { log('未确认金额：请先点击“确认金额”。', true); return; }

    const p = readParamsFromUI();
    const sig = $('signatures').value.trim();
    if (!sig) { log('请先生成 signatures', true); return; }

    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);
    const symbol = cinfo.nativeCurrency?.symbol || 'ETH';

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
      () => execTransaction(p, sig)
    );
    if (!proceed) { log('已取消执行'); return; }

    log('已请求钱包，请在钱包里确认；确认后等待链上回执…');
    const rc = await txPromise;
    log('✓ 执行成功：' + rc.transactionHash);
  } catch (e) { log(e.message || String(e), true); }
}

async function onSwitchNetwork() {
  const key = $('netSelect').value;
  try {
    await switchOrAdd(key);
    const c = CHAINS[key];
    const cid = parseInt(c.chainId, 16);
    $('chain').value = `${c.chainName} (chainId=${cid})`;
    setAmountSymbolByChainId(cid);
    // 切链后强制重新确认金额（单位不同更稳妥）
    amountConfirmed = false; updateAmountStatus();
    log('已切换到：' + c.chainName);
  } catch (e) { log(e.message || String(e), true); }
}

function main() {
  // 初始状态
  setAdvancedReadonly(true);
  updateToStatus();
  updateAmountStatus();

  // 事件绑定
  $('btnConnect').addEventListener('click', onConnect);
  $('btnRead').addEventListener('click', onRead);
  $('btnHash').addEventListener('click', onHash);
  $('btnApprove').addEventListener('click', onApprove);
  $('btnSig').addEventListener('click', onGenSig);
  $('btnExec').addEventListener('click', onExec);
  $('btnToggleAdvanced').addEventListener('click', toggleAdvanced);
  $('btnConfirmTo').addEventListener('click', confirmTo);
  $('btnConfirmAmount').addEventListener('click', confirmAmount);

  // 输入变更 → 取消确认（防止改了还锁着）
  $('to').addEventListener('input', () => { if (toConfirmed){ toConfirmed=false; updateToStatus(); log('收款地址已修改，需重新确认'); }});
  $('amountEth').addEventListener('input', () => { if (amountConfirmed){ amountConfirmed=false; updateAmountStatus(); log('金额已修改，需重新确认'); }});

  if (window.ethereum) {
    window.ethereum.on('chainChanged', (hexId) => {
      const num = parseInt(hexId, 16);
      const cinfo = chainInfoById(num);
      $('chain').value = `${cinfo.chainName} (chainId=${num})`;
      setAmountSymbolByChainId(num);
      amountConfirmed = false; updateAmountStatus(); // 切链后需重新确认金额
      log('检测到网络切换：' + hexId);
    });
    window.ethereum.on('accountsChanged', (accts) => {
      if (accts && accts.length) $('acct').textContent = `已连接：${accts[0]}`;
    });
  }

  // 切换 Safe 地址时，重新绑定
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
