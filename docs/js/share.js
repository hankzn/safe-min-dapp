// docs/js/share.js
/* global crypto */
import { ensure0x } from './utils.js';

// base64url 编解码
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

// 规范化载荷（字段顺序固定，类型统一为字符串/小写）
export function buildCanonicalPayload({ chainId, chainName, safe, tx, safeTxHash, threshold, approvedBy }) {
  const p = {
    v: '1',
    ts: new Date().toISOString(),
    chain: {
      chainId: String(chainId),
      chainName: chainName || ''
    },
    safe: (safe||'').toLowerCase(),
    tx: {
      to: (tx.to||'').toLowerCase(),
      valueWei: String(tx.valueWei||'0'),
      data: ensure0x(tx.data||'0x'),
      operation: String(tx.operation||0),
      safeTxGas: String(tx.safeTxGas||'0'),
      baseGas: String(tx.baseGas||'0'),
      gasPrice: String(tx.gasPrice||'0'),
      gasToken: (tx.gasToken||'0x0000000000000000000000000000000000000000').toLowerCase(),
      refundReceiver: (tx.refundReceiver||'0x0000000000000000000000000000000000000000').toLowerCase(),
      nonce: String(tx.nonce||'')
    },
    safeTxHash: ensure0x(safeTxHash||'0x'),
    threshold: threshold ? String(threshold) : '',
    approvedBy: approvedBy ? String(approvedBy).toLowerCase() : ''
  };
  return p; // 插入顺序就是 JSON.stringify 的键序
}

// 生成分享字符串： SAFE1.<base64url(JSON)>.<sha256(JSON)>
export async function makeShareString(payload){
  const json = JSON.stringify(payload);
  const hash = await sha256Hex(te.encode(json));
  const b64 = b64urlEncode(te.encode(json));
  return { share: `SAFE1.${b64}.${hash}`, sha256: hash, json };
}

// 解析分享字符串并校验 SHA-256
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
  return { payload, sha256: calc };
}

// 生成深链：把 base64url(JSON) 放到 hash，不经由服务端日志
export function makeDeepLink(payload){
  const json = JSON.stringify(payload);
  const b64 = b64urlEncode(te.encode(json));
  const url = `${location.origin}${location.pathname}#tx=${b64}`;
  return url;
}

// 下载 JSON 文件（内含 sha256 指纹）
export async function downloadShareFile(payload){
  const json = JSON.stringify({ ...payload, sha256: await sha256Hex(te.encode(JSON.stringify(payload))) }, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `safe-tx-${payload.safeTxHash.slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(a.href);
}
