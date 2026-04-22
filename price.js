// Vercel serverless function — server-side price proxy
// Fetches European ETF prices from Yahoo Finance (no CORS from server side)
// URL: /api/price?symbols=EUNL.DE,IWDA.AS

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const raw = req.query.symbols || '';
  const symbols = raw.split(',').map(s => s.trim()).filter(Boolean);

  if (!symbols.length) {
    return res.status(400).json({ error: 'No symbols provided' });
  }

  const prices = {};

  for (const sym of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d`;
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });
      const d = await r.json();
      const price = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
      if (price && price > 0) prices[sym] = price;
    } catch (e) {
      console.error(`Failed ${sym}:`, e.message);
    }
  }

  return res.status(200).json({ prices });
};
