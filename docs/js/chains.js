// docs/js/chains.js
export const CHAINS = {
  ethereum: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.ankr.com/eth', 'https://cloudflare-eth.com'],
    blockExplorerUrls: ['https://etherscan.io']
  },
  arbitrum: {
    chainId: '0xa4b1', // 42161
    chainName: 'Arbitrum One',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc', 'https://rpc.ankr.com/arbitrum'],
    blockExplorerUrls: ['https://arbiscan.io']
  },
  bsc: {
    chainId: '0x38', // 56
    chainName: 'BNB Smart Chain',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org', 'https://rpc.ankr.com/bsc'],
    blockExplorerUrls: ['https://bscscan.com']
  }
};

export async function switchOrAdd(key) {
  const c = CHAINS[key];
  if (!c) throw new Error('不支持的网络键：' + key);
  if (!window.ethereum) throw new Error('未检测到以太坊钱包');
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: c.chainId }]
    });
  } catch (e) {
    // 4902：钱包里还没有这个网络 → 先添加再切换
    const code = e?.code ?? e?.data?.originalError?.code;
    if (code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [c]
      });
    } else {
      throw e;
    }
  }
}
