// docs/js/wallet.js
/* global ethers */
let _provider = null;
let _signer = null;

export async function connectWallet() {
  if (!window.ethereum) throw new Error('未检测到钱包扩展（MetaMask / Rabby 等）');
  await window.ethereum.request({ method: 'eth_requestAccounts' });
  _provider = new ethers.providers.Web3Provider(window.ethereum, 'any');
  _signer = _provider.getSigner();
  const account = await _signer.getAddress();
  const net = await _provider.getNetwork();
  return { account, chainId: Number(net.chainId) };
}

export async function disconnectWallet() {
  // “软断开”：清空引用 + 尝试撤销站点权限（部分钱包支持）
  const had = !!_provider || !!_signer;
  _provider = null;
  _signer = null;
  try {
    if (window.ethereum?.request) {
      // 并非所有钱包都支持；忽略失败
      await window.ethereum.request({
        method: 'wallet_revokePermissions',
        params: [{ eth_accounts: {} }]
      });
    }
  } catch (_) {}
  return had;
}

export function getProvider() { return _provider; }
export function getSigner() { return _signer; }
