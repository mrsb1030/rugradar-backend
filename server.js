const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// CONFIG
const WALLET_ADDRESS = (process.env.WALLET_ADDRESS || '').toLowerCase();
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ''; // Multichain V2 key
const PORT = process.env.PORT || 10000;

// V2 base URL + chain IDs
const V2_URL = 'https://api.etherscan.io/v2/api';
const CHAIN = {
  eth: 1,        // Ethereum Mainnet
  bsc: 56,       // BNB Smart Chain
  polygon: 137,  // Polygon Mainnet
};

app.get('/', (req, res) => {
  res.json({ status: 'RugRadar backend running', wallet: WALLET_ADDRESS, chains: CHAIN });
});

/**
 * POST /verify-payment
 * body: { txHash: string, network: "eth" | "bsc" | "polygon" }
 */
app.post('/verify-payment', async (req, res) => {
  try {
    const { txHash, network } = req.body || {};
    if (!txHash || !network) return res.status(400).json({ success:false, error:'Missing txHash or network' });
    if (!WALLET_ADDRESS)     return res.status(500).json({ success:false, error:'Server wallet not configured' });

    const net = normalizeNetwork(network);
    const chainid = CHAIN[net];
    if (!chainid) return res.status(400).json({ success:false, error:'Unsupported network' });

    const result = await verifyOnChain(chainid, txHash);
    return res.json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success:false, error:'Internal error', details:String(e) });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

/* ---------------- Helpers ---------------- */

function normalizeNetwork(n) {
  const x = String(n).toLowerCase();
  if (['eth','ethereum','mainnet'].includes(x)) return 'eth';
  if (['bsc','bnb','binance','binance-smart-chain'].includes(x)) return 'bsc';
  if (['polygon','matic','poly'].includes(x)) return 'polygon';
  return x;
}

async function verifyOnChain(chainid, txHash) {
  // 1) Check native transfer first via proxy:getTransactionByHash
  const txResp = await etherscanV2('proxy', 'eth_getTransactionByHash', chainid, { txhash: txHash });
  const tx = txResp?.result;
  if (!tx) return { success:false, error:`Tx not found on chain ${chainid}` };

  // Native transfer direct to our wallet?
  if (tx.to && tx.to.toLowerCase() === WALLET_ADDRESS) {
    const rc = await etherscanV2('proxy', 'eth_getTransactionReceipt', chainid, { txhash: txHash });
    const status = rc?.result?.status;
    const ok = status === '0x1';
    return ok
      ? { success:true, network:chainid, type:'NATIVE', to:tx.to, hash:txHash }
      : { success:false, error:'Native transfer failed', hash:txHash };
  }

  // 2) If not native, check token transfers to our wallet by matching hash
  const tok = await etherscanV2('account', 'tokentx', chainid, {
    address: WALLET_ADDRESS,
    page: 1, offset: 100, sort: 'desc'
  });
  const list = tok?.result || [];
  const match = list.find(r => (r.hash || '').toLowerCase() === txHash.toLowerCase());

  if (!match) return { success:false, error:`Tx not found to your wallet (token) on chain ${chainid}`, hash: txHash };

  if (match.to && match.to.toLowerCase() === WALLET_ADDRESS) {
    return {
      success: true,
      network: chainid,
      type: 'TOKEN',
      tokenSymbol: match.tokenSymbol,
      tokenDecimal: match.tokenDecimal,
      contractAddress: match.contractAddress,
      value: match.value,
      hash: txHash
    };
  }
  return { success:false, error:'Token tx does not target your wallet', hash: txHash };
}

async function etherscanV2(module, action, chainid, extraParams = {}) {
  const params = new URLSearchParams({ module, action, chainid: String(chainid), apikey: ETHERSCAN_API_KEY });
  for (const [k, v] of Object.entries(extraParams)) params.append(k, String(v));
  const url = `${V2_URL}?${params.toString()}`;
  const { data } = await axios.get(url).catch(() => ({ data: null }));
  return data;
}
