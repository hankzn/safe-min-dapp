// docs/js/utils.js
/* global ethers */

export const $ = (id) => document.getElementById(id);

// docs/js/utils.js
export function log(msg, isErr = false) {
  const box = document.getElementById('log');
  if (!box) return;

  const now = new Date();
  const ts = now.toLocaleTimeString('zh-CN', { hour12: false }); // 如 14:05:09
  const text = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);

  const line = document.createElement('div');
  line.className = isErr ? 'err' : 'ok';
  line.textContent = `[${ts}] ${text}`;
  box.prepend(line);

  // 只保留最新 N 条日志
  const MAX = 200;
  while (box.childElementCount > MAX) box.removeChild(box.lastChild);

  // 最新在顶部 → 将滚动置顶
  box.scrollTop = 0;
}


export function ensure0x(hex) {
  const h = (hex || '').trim();
  if (h === '' || h === '0') return '0x';
  return h.startsWith('0x') ? h : '0x' + h;
}

export function toWeiFromEthStr(s) {
  const t = (s || '').trim();
  if (!t) return '0';
  return ethers.utils.parseEther(t).toString();
}

export function zeroAddr() {
  return '0x0000000000000000000000000000000000000000';
}

export function isHexAddress(a) {
  return /^0x[0-9a-fA-F]{40}$/.test(a || '');
}

export function sortLowercaseAddresses(list) {
  return list.map(s => s.trim().toLowerCase()).filter(Boolean).sort();
}
