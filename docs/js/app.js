// docs/js/app.js
/* global ethers */
import { buildCanonicalPayload, makeShareString, parseShareString, downloadShareFile, makeDeepLink } from './share.js';
import { $, log, ensure0x, toWeiFromEthStr, zeroAddr, isHexAddress, sortLowercaseAddresses } from './utils.js';
import { connectWallet, getProvider, getSigner, disconnectWallet } from './wallet.js';
import { bindSafe, unbindSafe, readThreshold, readNonce, getTransactionHash, approveHash, execTransaction, readOwners, getApprovalsForHash } from './safe.js';
import { switchOrAdd, CHAINS } from './chains.js';
import { openConfirmTwoStep } from './confirm.js';
import { normalizeApprovedListFromPayload } from './share.js';

// ====== 全局状态：地址/金额确认，高级参数锁定、批准缓存 ======
let toConfirmed = false;
let amountConfirmed = false;
let advancedUnlocked = false;
let approvalsCache = { owners: [], approvedOwners: [], map: {} };
const ADV_IDS = ['operation','safeTxGas','baseGas','gasPrice','gasToken','refundReceiver'];

// ====== 工具与显示 ======
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
function genPrevalidatedSignaturesFromOwners(owners) {
  const sorted = sortLowercaseAddresses(owners);
  const chunks = sorted.map(a => a.slice(2).padStart(64,'0') + '0'.repeat(64) + '01');
  return { owners_sorted: sorted, sig: '0x' + chunks.join('') };
}
function setAmountSymbolByChainId(chainIdNum) {
  let symbol = 'ETH';
  for (const k in CHAINS) {
    const c = CHAINS[k];
    if (parseInt(c.chainId, 16) === chainIdNum) { symbol = c.nativeCurrency?.symbol || symbol; break; }
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
  for (const k in CHAINS) { const c = CHAINS[k]; if (parseInt(c.chainId, 16) === numId) return c; }
  return { chainId: '0x' + numId.toString(16), chainName: `Unknown (${numId})`, nativeCurrency:{symbol:'ETH'} };
}

// ====== 地址/金额确认 ======
function updateToStatus() {
  const st = $('toStatus'); const input = $('to');
  if (!st || !input) return;
  if (toConfirmed) { input.readOnly = true; input.classList.add('confirmed','critical-input'); st.textContent='已确认收款地址（锁定，需更改请刷新页面）'; st.className='hint status-ok'; }
  else { input.readOnly = false; input.classList.add('critical-input'); input.classList.remove('confirmed'); st.textContent='请填写后点击“确认地址”，未确认将无法计算/执行'; st.className='hint status-warn'; }
}
function confirmTo() {
  const addr = $('to').value.trim();
  if (!isHexAddress(addr)) { log('收款地址格式不正确：需 0x 开头的 40 位十六进制地址', true); return; }
  toConfirmed = true; updateToStatus(); log('已确认收款地址：' + addr);
}
function updateAmountStatus() {
  const st = $('amountStatus'); const input = $('amountEth');
  if (!st || !input) return;
  if (amountConfirmed) { input.readOnly = true; input.classList.add('confirmed','critical-input'); st.textContent='已确认金额（锁定，需更改请刷新页面）'; st.className='hint status-ok'; }
  else { input.readOnly = false; input.classList.add('critical-input'); input.classList.remove('confirmed'); st.textContent='请填写后点击“确认金额”，未确认将无法计算/执行'; st.className='hint status-warn'; }
}
function confirmAmount() {
  const val = ($('amountEth').value || '').trim();
  try { const wei = ethers.utils.parseEther(val); if (wei.lt(0)) throw new Error('金额必须 >= 0'); }
  catch { log('金额格式不正确：请输入形如 0.001 的数字（最多 18 位小数）', true); return; }
  amountConfirmed = true; updateAmountStatus(); log('已确认金额：' + val);
}

// ====== 高级参数锁/解锁 ======
function setAdvancedReadonly(readonly) { ADV_IDS.forEach(id => { const el = $(id); if (el) el.readOnly = readonly; }); }
function toggleAdvanced() {
  const btn = $('btnToggleAdvanced');
  if (!advancedUnlocked) {
    const ok = window.confirm('解锁高级参数可能导致交易失败或资金风险。\n仅在完全理解参数意义时才修改。\n是否确认解锁？');
    if (!ok) return;
    advancedUnlocked = true; setAdvancedReadonly(false); if (btn) btn.textContent = '锁定高级参数'; log('已解锁高级参数，请谨慎修改！');
  } else {
    advancedUnlocked = false; setAdvancedReadonly(true); if (btn) btn.textContent = '解锁高级参数'; log('已锁定高级参数。');
  }
}

// ====== 连接 / 断开 / 绑定 / 切换账号 / 切链 ======
async function onConnect() {
  const res = await connectWallet();
  const cinfo = chainInfoById(Number(res.chainId));
  $('acct').textContent = `已连接：${res.account}`;
  $('chain').value = `${cinfo.chainName} (chainId=${Number(res.chainId)})`;
  setAmountSymbolByChainId(Number(res.chainId));
  log('钱包已连接。若要操作 Safe，请先“绑定合约”。');
}
async function onDisconnect() {
  const had = await disconnectWallet();
  unbindSafe();
  $('acct').textContent = '';
  $('chain').value = '';
  log(had ? '已断开钱包并解除合约绑定（如需彻底断开，请在钱包的“已连接网站”里移除本网站）' : '当前未连接钱包');
}
async function onBindSafe() {
  try {
    const addr = $('safe').value.trim();
    if (!isHexAddress(addr)) throw new Error('Safe 地址格式不正确');
    const sp = getSigner() || getProvider();
    if (!sp) throw new Error('请先连接钱包，再绑定合约');
    bindSafe(addr, sp);
    log('已绑定 Safe 合约：' + addr);
  } catch (e) { log(e.message || String(e), true); }
}
async function onSwitchAccount() {
  if (!window.ethereum) { log('未检测到钱包扩展', true); return; }
  try {
    await window.ethereum.request({ method: 'wallet_requestPermissions', params: [{ eth_accounts: {} }] });
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    log('已请求切换账号，请在钱包中选择要使用的账户');
  } catch (e) { log(e?.message || String(e), true); }
}
async function onSwitchNetwork() {
  const key = $('netSelect').value;
  try {
    await switchOrAdd(key);
    const c = CHAINS[key]; const cid = parseInt(c.chainId, 16);
    $('chain').value = `${c.chainName} (chainId=${cid})`;
    setAmountSymbolByChainId(cid);
    if (amountConfirmed){ amountConfirmed=false; updateAmountStatus(); log('已切链，请重新确认金额'); }
    log('已切换到：' + c.chainName);
  } catch (e) { log(e.message || String(e), true); }
}

// ====== 读取 / 计算哈希 ======
async function onRead() {
  try {
    const th = await readThreshold(); $('threshold').value = th;
    let n = $('nonce').value.trim(); if (!n) { n = await readNonce(); $('nonce').value = n; }
    log({ threshold: th, nonce: n });
  } catch (e) { log(e.message || String(e), true); }
}
async function ensureSafeTxHash() {
  if (!getSigner()) throw new Error('未连接钱包，请先连接');
  try { // 确保已绑定
    // 触发一次 getContract() 的访问是读函数里完成的，这里只要不抛错即可
    // 若未绑定，后续 readNonce/getTransactionHash 会抛错
  } catch {}
  if (!toConfirmed) { throw new Error('未确认收款地址：请先点击“确认地址”。'); }
  if (!amountConfirmed) { throw new Error('未确认金额：请先点击“确认金额”。'); }
  const p = readParamsFromUI();
  if (!p.nonce) { p.nonce = await readNonce(); $('nonce').value = p.nonce; }
  let h = $('safeTxHash').value.trim();
  if (!h) { h = await getTransactionHash(p); $('safeTxHash').value = h; }
  return { hash: h, params: p };
}
async function onHash() {
  try { const { hash } = await ensureSafeTxHash(); log({ safeTxHash: hash }); }
  catch (e) { log(e.message || String(e), true); }
}

// ====== 批准状态 ======
function renderApprovalsUI(data, threshold) {
  const box = $('approvalsBox'); const sum = $('approvalSummary');
  if (!box || !sum) return;
  const rows = data.owners.map(o => `${data.map[o] ? '✅' : '⏳'} ${o}`);
  box.textContent = rows.join('\n');
  sum.textContent = `已批准 ${data.approvedOwners.length} / 阈值 ${threshold}`;
}
async function refreshApprovals() {
  try {
    const th = Number($('threshold').value || (await readThreshold()));
    if (!$('threshold').value) $('threshold').value = String(th);
    const { hash } = await ensureSafeTxHash();
    const data = await getApprovalsForHash(hash);
    approvalsCache = data;
    renderApprovalsUI(data, th);
    if (data.approvedOwners.length >= th) log(`已满足阈值：${data.approvedOwners.length}/${th}，可一键生成 signatures 并执行`);
    else log(`尚未满足阈值：${data.approvedOwners.length}/${th}，请更多 Owner 执行 approveHash`);
  } catch (e) { log(e.message || String(e), true); }
}
function autoGenSignaturesFromApprovals() {
  const th = Number($('threshold').value || '0');
  const n = approvalsCache?.approvedOwners?.length || 0;
  if (!n) { log('当前没有任何批准记录，请先让 Owner 调用 approveHash', true); return; }
  if (n < th) { log(`批准数量未达阈值：${n}/${th}，生成的 signatures 可能无法通过验证`, true); return; }
  const { owners_sorted, sig } = genPrevalidatedSignaturesFromOwners(approvalsCache.approvedOwners);
  $('signatures').value = sig;
  log({ signatures_from_approved: owners_sorted, signatures_len: sig.length });
}

// ====== 批准 / 执行 ======
async function onApprove() {
  const btn = $('btnApprove');           // 防抖：批准按钮禁用
  if (btn) btn.disabled = true;

  try {
    await ensureSafeTxHash();

    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);
    const safeAddr = $('safe').value.trim();
    const signerAddr = await getSigner().getAddress().catch(() => null);
    const h = $('safeTxHash').value.trim();

    const rows = [
      ['网络', `${cinfo.chainName} (chainId=${chainIdNum})`],
      ['操作', 'approveHash'],
      ['Signer 地址', signerAddr || '(未知/未连接)'],
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

    // ✅ 等链上确认成功
    const rc = await txPromise;
    log('approveHash 确认：' + rc.transactionHash);

    // 先刷新批准状态（让面板展示最新 owner✅ 列表）
    await refreshApprovals();

    // 再生成分享串（包含最新的信息，便于发给下一位）
    try { await onBuildShare(); } catch (_) {}

    // （可选）阈值已满足时，自动拼 signatures 方便执行
    try {
      const th = Number($('threshold').value || 0);
      if ((approvalsCache?.approvedOwners?.length || 0) >= th) {
        autoGenSignaturesFromApprovals?.();
      }
    } catch (_) {}
  } catch (e) {
    // 更友好的拒签提示
    if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') {
      log('已取消：你在钱包里拒绝了本次批准。', true);
    } else {
      log(e.message || String(e), true);
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}
function onGenSigManual() {
  try {
    const ownersInput = ($('owners')?.value || '').trim();
    if (!ownersInput) { log('请填写 Owner 地址列表，或使用“根据批准生成 signatures”按钮', true); return; }
    const owners = ownersInput.split(',').map(s=>s.trim()).filter(Boolean);
    const { owners_sorted, sig } = genPrevalidatedSignaturesFromOwners(owners);
    $('signatures').value = sig;
    log({ owners_sorted, signatures_len: sig.length });
  } catch (e) { log(e.message || String(e), true); }
}
async function onExec() {
  try {
    await ensureSafeTxHash();
    const p = readParamsFromUI();
    const sig = $('signatures').value.trim();
    if (!sig) { log('请先生成 signatures（推荐：根据批准生成）', true); return; }

    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);
    const symbol = cinfo.nativeCurrency?.symbol || 'ETH';
    const signerAddr = await getSigner().getAddress().catch(()=>null);

    const h = $('safeTxHash').value.trim();
    const safeAddr = $('safe').value.trim();
    const amountHuman = ($('amountEth').value || '0').trim();
    const dataBytes = p.data === '0x' ? 0 : Math.max(0, (p.data.length - 2) / 2);
    const opName = (p.operation === 0 ? 'CALL(0)' : p.operation === 1 ? 'DELEGATECALL(1)' : String(p.operation));

    const rows = [
      ['网络', `${cinfo.chainName} (chainId=${chainIdNum})`],
      ['操作', 'execTransaction'],
      ['Signer 地址', signerAddr || '(未知/未连接)'],
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

// ====== 共享 ======
async function onBuildShare() {
  try {
    // 1) 确保有安全参数和本地 safeTxHash
    const { hash, params } = await ensureSafeTxHash();

    // 2) 阈值 / signer / 链信息
    let th = $('threshold').value;
    if (!th) th = await readThreshold();
    let signerAddr = null;
    try { signerAddr = await getSigner().getAddress(); } catch {}

    const provider = getProvider() || (getSigner() && getSigner().provider);
    const net = provider ? await provider.getNetwork() : { chainId: NaN };
    const chainIdNum = Number(net.chainId);
    const cinfo = chainInfoById(chainIdNum);

    // 3) 已批准列表：优先用缓存；没有就链上现查；再不行才退化用 signer
    let approvedByList = approvalsCache?.approvedOwners || [];
    if (!approvedByList?.length) {
      try {
        const { approvedOwners } = await getApprovalsForHash(hash);
        approvedByList = approvedOwners;
      } catch (_) {}
    }
    if (!approvedByList?.length && signerAddr) {
      approvedByList = [signerAddr];
    }

    // 4) 构建 v2 载荷（带 approvedByList）
    const payload = buildCanonicalPayload({
      chainId: chainIdNum,
      chainName: cinfo.chainName,
      safe: $('safe').value.trim(),
      tx: params,
      safeTxHash: hash,
      threshold: th,
      approvedByList
    });

    const { share, sha256 } = await makeShareString(payload);
    $('shareStr').value = share;

    const who = (approvedByList || []).length ? `，已批准：${approvedByList.join(',')}` : '';
    $('shareInfo').textContent = `SHA-256=${sha256.slice(0,16)}…  长度=${share.length}${who}`;
    log('已生成分享字符串（包含已批准列表）');
  } catch (e) { log(e.message || String(e), true); }
}
async function onCopyShare() {
  try {
    const s = $('shareStr').value.trim();
    if (!s) { log('请先生成分享字符串', true); return; }
    await navigator.clipboard.writeText(s);
    log('已复制分享字符串到剪贴板');
  } catch (e) { log(e.message || String(e), true); }
}
async function onDownloadShare() {
  try {
    const s = $('shareStr').value.trim();
    if (!s) { log('请先生成分享字符串', true); return; }
    const { payload } = await parseShareString(s);
    await downloadShareFile(payload);
    log('已下载 JSON 文件（内含 SHA-256 指纹）');
  } catch (e) { log(e.message || String(e), true); }
}
async function onImportStr() {
  try {
    const s = $('importStr').value.trim();
    if (!s) { log('请粘贴分享字符串 SAFE1.…', true); return; }

    const { payload, sha256 } = await parseShareString(s);

    // 1) 切链（如果我们支持该链）
    const chainIdNum = Number(payload.chain?.chainId || 0);
    const match = Object.entries(CHAINS).find(([_, v]) => parseInt(v.chainId, 16) === chainIdNum);
    if (match) {
      await switchOrAdd(match[0]);
      $('chain').value = `${match[1].chainName} (chainId=${chainIdNum})`;
      setAmountSymbolByChainId(chainIdNum);
      log(`已切换到 ${match[1].chainName}`);
    } else {
      log(`未知链 ${chainIdNum}，请手动切换`, true);
    }

    // 2) 填充 Safe 地址（不自动绑定，避免误操作）
    if (payload.safe) $('safe').value = payload.safe;

    // 3) 填充交易参数
    const t = payload.tx || {};
    $('to').value = t.to || '';
    $('amountEth').value = (window.ethers && t.valueWei != null) ? ethers.utils.formatEther(t.valueWei) : '';
    $('data').value = t.data || '0x';
    $('operation').value = t.operation ?? '0';
    $('safeTxGas').value = t.safeTxGas ?? '0';
    $('baseGas').value = t.baseGas ?? '0';
    $('gasPrice').value = t.gasPrice ?? '0';
    $('gasToken').value = t.gasToken ?? '0x0000000000000000000000000000000000000000';
    $('refundReceiver').value = t.refundReceiver ?? '0x0000000000000000000000000000000000000000';
    $('nonce').value = t.nonce ?? '';

    // 4) 设为已确认（来自可信载荷），并更新提示
    toConfirmed = !!t.to; updateToStatus();
    amountConfirmed = t.valueWei != null; updateAmountStatus();

    // 5) 尝试自动绑定（若已连接钱包），用于本地校验 safeTxHash
    const sp = getSigner() || getProvider();
    if (sp && payload.safe) {
      try { bindSafe(payload.safe, sp); } catch (_) {}
    }

    // 6) 计算并校验 safeTxHash（若未连接/未绑定，会给出友好提示）
    try {
      const { hash: localHash } = await ensureSafeTxHash();
      $('safeTxHash').value = localHash;
      if ((payload.safeTxHash || '').toLowerCase() !== (localHash || '').toLowerCase()) {
        log('警告：载荷 safeTxHash 与本地计算不一致，请勿继续！', true);
      } else {
        log(`已导入并校验成功（SHA-256 前缀 ${sha256.slice(0,16)}…）`);
      }
    } catch (e) {
      log('已完成参数填充，但尚未校验 safeTxHash：请先“连接钱包并绑定合约”，再点一次“解析并填充”。', true);
    }

    // 7) 显示分享中声称的已批准列表（仅提示；以链上为准）
    try {
      const importedApproved = normalizeApprovedListFromPayload(payload);
      if (importedApproved.length) {
        log('分享信息显示已批准（未必最新）：' + importedApproved.join(','));
      }
    } catch (_) {}

    // 引导用户拉取链上真值
    log('建议点击“刷新批准状态”，以链上实际为准');
  } catch (e) {
    log(e.message || String(e), true);
  }
}
async function onMakeLink() {
  try {
    const s = $('shareStr').value.trim();
    if (!s) { log('请先生成分享字符串', true); return; }
    const { payload } = await parseShareString(s);
    const url = makeDeepLink(payload);
    await navigator.clipboard.writeText(url);
    log('已复制深链：打开即自动填充（信息在 URL #hash，不经服务端）');
  } catch (e) { log(e.message || String(e), true); }
}
function clearQR(){ const box = $('qrBox'); if (box) box.innerHTML=''; }
async function onShowQR(){
  try{
    // 没有分享串就先自动生成一份（含安全校验）
    if (!$('shareStr').value.trim()) { await onBuildShare(); }
    const s = $('shareStr').value.trim();
    if (!s) { log('请先生成分享字符串', true); return; }

    // 用分享串解析出 payload → 生成深链（#tx=...）
    const { payload } = await parseShareString(s);
    const url = makeDeepLink(payload);

    // 生成二维码
    clearQR();
    // 依赖全局 QRCode（来自 qrcode.min.js）
    // 宽高 256，可按需改为 320/384；容错等级 M 即可
    new QRCode($('qrBox'), { text: url, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M });

    $('qrMeta').textContent = '用手机相机/钱包扫码打开即可自动填充参数（信息在 URL #hash，仅本地解析）';
    $('qrOverlay').style.display = 'flex';

    // 体验优化：顺便把深链也复制到剪贴板
    try { await navigator.clipboard.writeText(url); } catch(_) {}
  }catch(e){
    log(e.message || String(e), true);
  }
}
function closeQR(){
  $('qrOverlay').style.display = 'none';
  clearQR();
}



// ====== 初始化与事件绑定 ======
// ✅ 把 main 声明为 async（因内部有 await）
async function main() {
  setAdvancedReadonly(true);
  updateToStatus();
  updateAmountStatus();

  // 事件绑定（可选：加 ? 防止元素缺失时报错）
  $('btnConnect')?.addEventListener('click', onConnect);
  $('btnDisconnect')?.addEventListener('click', onDisconnect);
  $('btnSwitchAccount')?.addEventListener('click', onSwitchAccount);
  $('btnBindSafe')?.addEventListener('click', onBindSafe);

  $('btnRead')?.addEventListener('click', onRead);
  $('btnHash')?.addEventListener('click', onHash);
  $('btnApprove')?.addEventListener('click', onApprove);
  $('btnSig')?.addEventListener('click', onGenSigManual);
  $('btnAutoSig')?.addEventListener('click', autoGenSignaturesFromApprovals);
  $('btnExec')?.addEventListener('click', onExec);
  $('btnToggleAdvanced')?.addEventListener('click', toggleAdvanced);
  $('btnConfirmTo')?.addEventListener('click', confirmTo);
  $('btnConfirmAmount')?.addEventListener('click', confirmAmount);
  $('btnRefreshApprovals')?.addEventListener('click', refreshApprovals);

  $('btnBuildShare')?.addEventListener('click', onBuildShare);
  $('btnCopyShare')?.addEventListener('click', onCopyShare);
  $('btnDownloadShare')?.addEventListener('click', onDownloadShare);
  $('btnImportStr')?.addEventListener('click', onImportStr);
  $('btnMakeLink')?.addEventListener('click', onMakeLink);
  $('btnShowQR')?.addEventListener('click', onShowQR);
  $('btnCloseQR')?.addEventListener('click', closeQR);
  // 点击遮罩空白处也关闭
  $('qrOverlay')?.addEventListener('click', (e) => { if (e.target?.id === 'qrOverlay') closeQR(); });


  // 输入改动 → 取消确认
  $('to')?.addEventListener('input', () => {
    if (toConfirmed){ toConfirmed=false; updateToStatus(); log('收款地址已修改，需重新确认'); }
  });
  $('amountEth')?.addEventListener('input', () => {
    if (amountConfirmed){ amountConfirmed=false; updateAmountStatus(); log('金额已修改，需重新确认'); }
  });

  // 钱包事件
  if (window.ethereum) {
    window.ethereum.on('chainChanged', (hexId) => {
      const num = parseInt(hexId, 16);
      const cinfo = chainInfoById(num);
      $('chain').value = `${cinfo.chainName} (chainId=${num})`;
      setAmountSymbolByChainId(num);
      if (amountConfirmed){ amountConfirmed=false; updateAmountStatus(); log('检测到网络切换：需重新确认金额'); }
      log('检测到网络切换：' + hexId);
    });
    window.ethereum.on('accountsChanged', async (accts) => {
      if (accts && accts.length) {
        $('acct').textContent = `已连接：${accts[0]}`;
        log('已切换账号为：' + accts[0]);
        try {
          const addr = $('safe').value.trim();
          if (addr && getProvider()) {
            bindSafe(addr, getSigner() || getProvider());
            log('已用新账号重新绑定 Safe 合约：' + addr);
          }
        } catch (e) { log(e?.message || String(e), true); }
      } else {
        $('acct').textContent = '';
        log('账号已断开或清空授权', true);
      }
    });
  }

  // Safe 地址变化 -> 只提示，不自动绑定
  $('safe')?.addEventListener('change', () => {
    log('Safe 地址已修改：点击“绑定合约”以生效');
  });

  // ✅ 如果 URL 带 #tx=... 深链，自动解析填充
  try {
    const m = (location.hash || '').match(/[#&]tx=([^&]+)/);
    if (m) {
      const b64 = m[1];

      // base64url → payload（这里直接本地解码即可）
      const b64urlDecode = (str) => {
        const b64 = str.replace(/-/g,'+').replace(/_/g,'/');
        const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
        const bin = atob(b64 + pad);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return arr.buffer;
      };
      const json = new TextDecoder().decode(b64urlDecode(b64));
      const payload = JSON.parse(json);

      // 生成带 SHA-256 的分享串（复用你的导入流程与校验）
      const { makeShareString } = await import('./share.js');
      const { share } = await makeShareString(payload);
      $('importStr').value = share;

      // 建议 await 保证填充完成再让用户操作
      await onImportStr();
    }
  } catch (_) {
    // 静默忽略深链解析错误，避免影响正常使用
  }
}

// ✅ 确保在 DOMReady 后调用，并捕获潜在错误写入日志
document.addEventListener('DOMContentLoaded', () => {
  main().catch(e => log(e?.message || String(e), true));
});


document.addEventListener('DOMContentLoaded', main);
