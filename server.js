const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const WALLET_ADDRESS = process.env.WALLET_ADDRESS || '0xYOUR_WALLET_ADDRESS';
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
    res.json({ status: 'RugRadar backend running', wallet: WALLET_ADDRESS });
});

// Example endpoint: verify payment (mock for now)
app.post('/verify-payment', async (req, res) => {
    const { txHash, network } = req.body;
    if (!txHash || !network) {
        return res.status(400).json({ error: 'Missing txHash or network' });
    }

    // In real version: query blockchain explorer API to confirm tx
    return res.json({ success: true, txHash, network, wallet: WALLET_ADDRESS });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
