// api/analyze.js
// Vercel serverless function — fetches live token data from DexScreener's
// free public API and returns it in the shape Rug Radar's scoring engine expects.
//
// Deploy this on Vercel and call it like:
//   https://your-project.vercel.app/api/analyze?address=<SOLANA_TOKEN_ADDRESS>
//
// No API key needed for this endpoint — DexScreener's public API is free.

export default async function handler(req, res) {
  // Allow the frontend (hosted anywhere) to call this endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const address = (req.query.address || '').trim();

  if (!address) {
    res.status(400).json({ error: 'Missing "address" query parameter.' });
    return;
  }

  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`);

    if (!dexRes.ok) {
      res.status(502).json({ error: 'DexScreener API request failed.', status: dexRes.status });
      return;
    }

    const data = await dexRes.json();
    const pairs = data.pairs || [];

    if (pairs.length === 0) {
      res.status(404).json({ error: 'No trading pair found for this address. Check the contract address is correct, or the token has no liquidity yet.' });
      return;
    }

    // If a token trades on multiple pools, use the one with the most liquidity
    const pair = pairs.reduce((best, p) =>
      (p.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? p : best
    , pairs[0]);

    const ageHours = pair.pairCreatedAt
      ? (Date.now() - pair.pairCreatedAt) / 3600000
      : null;

    const result = {
      tokenName: pair.baseToken?.name || null,
      tokenSymbol: pair.baseToken?.symbol || null,
      dexUrl: pair.url || null,
      rugcheckUrl: `https://rugcheck.xyz/tokens/${address}`,

      mc: pair.marketCap ?? pair.fdv ?? null,
      liq: pair.liquidity?.usd ?? null,
      vol: pair.volume?.h24 ?? null,
      pchange: pair.priceChange?.h24 ?? null,
      buys: pair.txns?.h24?.buys ?? null,
      sells: pair.txns?.h24?.sells ?? null,
      age: ageHours !== null ? Math.round(ageHours * 10) / 10 : null,

      top10: null,
      devWallet: null,
      lpLocked: null,
      lpBurned: null,
      mintRevoked: null,
      freezeRevoked: null,
      renounced: null,
    };

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json(result);

  } catch (err) {
    res.status(500).json({ error: 'Unexpected server error.', detail: String(err) });
  }
}
