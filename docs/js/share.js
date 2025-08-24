// docs/js/share.js
/* global crypto */
import { ensure0x } from './utils.js';

// ---------- 小工具 ----------
const te = new TextEncoder();
const td = new TextDecoder();
function b64urlEncode(buf){
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str){
  const b64 = str.replace(/-/g,'+').replace(/_/g,'/');
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const bin = atob(b64 + pad);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
async function sha256Hex(bytes){
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
const normAddr = a => (a||'').toLowerCase();
const uniqSortAddr = (arr=[]) => Array.from(new Set(arr.filter(Boolean).map(normAddr))).sort();

// ---------- 兼容：把 payload 中的单个 approvedBy/数组 approvedByList 统一成数组 ----------
export function normalizeApprovedListFromPayload(payload){
  const v1 = payload?.approvedBy ? [payload.approvedBy] : [];
  const v2 = Array.isArray(payload?.approvedByList) ? payload.approvedByList : [];
  return uniqSortAddr([...v1, ...v2]);
}

// ---------- 构建“规范化载荷”（v2） ----------
/**
 * 入参：{ chainId, chainName, safe, tx, safeTxHash, threshold, approvedByList? }
 * - 地址统一 lowerCase
 * - 数字转字符串
 * - 字段顺序固定，便于签名/哈希稳定
 * - v: '2'（兼容保留 approvedBy: '' 字段，便于旧版解析）
 */
export function buildCanonicalPayload({ chainId, chainName, safe, tx, safeTxHash, threshold, approvedByList }) {
  const approvedList = uniqSortAddr(approvedByList || []);

  const p = {
    v: '2',
    ts: new Date().toISOString(),
    chain: {
      chainId: String(chainId ?? ''),
      chainName: chainName || ''
    },
    safe: normAddr(safe),
    tx: {
      to: normAddr(tx?.to),
      valueWei: String(tx?.valueWei ?? '0'),
      data: ensure0x(tx?.data ?? '0x'),
      operation: String(tx?.operation ?? 0),
      safeTxGas: String(tx?.safeTxGas ?? '0'),
      baseGas: String(tx?.baseGas ?? '0'),
      gasPrice: String(tx?.gasPrice ?? '0'),
      gasToken: normAddr(tx?.gasToken ?? '0x0000000000000000000000000000000000000000'),
      refundReceiver: normAddr(tx?.refundReceiver ?? '0x0000000000000000000000000000000000000000'),
      nonce: String(tx?.nonce ?? '')
    },
    safeTxHash: ensure0x(safeTxHash || '0x'),
    threshold: threshold ? String(threshold) : '',
    // v2 新增：多人
    approvedByList: approvedList,
    // 兼容 v1：保留一个空串字段，旧版读取不报错
    approvedBy: approvedList[0] || ''
  };
  return p;
}

// ---------- 分享串 SAFE1.<b64url(JSON)>.SHA256 ----------
export async function makeShareString(payload){
  const json = JSON.stringify(payload);
  const hash = await sha256Hex(te.encode(json));
  const b64 = b64urlEncode(te.encode(json));
  return { share: `SAFE1.${b64}.${hash}`, sha256: hash, json };
}

// ---------- 解析分享串并校验 ----------
export async function parseShareString(str){
  if (!/^SAFE1\./.test(str)) throw new Error('格式不对，缺少 SAFE1 前缀');
  const parts = str.split('.');
  if (parts.length !== 3) throw new Error('格式不对，段数应为 3');
  const b64 = parts[1], given = parts[2].toLowerCase();
  const buf = b64urlDecode(b64);
  const json = td.decode(buf);
  const calc = (await sha256Hex(te.encode(json))).toLowerCase();
  if (calc !== given) throw new Error('指纹校验失败：内容可能被篡改');
  const payload = JSON.parse(json);
  // 回填：老版本载荷没有 approvedByList，就从 approvedBy 补
  if (!Array.isArray(payload.approvedByList)) {
    payload.approvedByList = normalizeApprovedListFromPayload(payload);
  }
  return { payload, sha256: calc };
}

// ---------- 深链 ----------
export function makeDeepLink(payload){
  const json = JSON.stringify(payload);
  const b64 = b64urlEncode(te.encode(json));
  return `${location.origin}${location.pathname}#tx=${b64}`;
}

// ---------- 下载 JSON（带 SHA-256 指纹） ----------
export async function downloadShareFile(payload){
  const pure = JSON.stringify(payload);
  const json = JSON.stringify({ ...payload, sha256: await sha256Hex(te.encode(pure)) }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `safe-tx-${payload.safeTxHash.slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}
