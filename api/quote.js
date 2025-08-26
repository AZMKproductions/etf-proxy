export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const { symbols } = req.query;
    if (!symbols) return res.status(400).json({ error: "Missing symbols parameter" });

    const key = process.env.FINNHUB_KEY;
    if (!key) return res.status(500).json({ error: "FINNHUB_KEY is not set in environment variables" });

    const tickers = symbols
      .split(",")
      .map(s => s.trim().toUpperCase())
      .filter(s => /^[A-Z0-9.\-]{1,12}$/.test(s));

    const results = [];
    for (const t of tickers) {
      const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(key)}`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) { results.push({ symbol: t, error: `HTTP ${r.status}` }); continue; }

      const j = await r.json();
      const price = Number.isFinite(j.c) ? j.c : null;
      const prev  = Number.isFinite(j.pc) ? j.pc : null;
      const dp = (Number.isFinite(price) && Number.isFinite(prev) && prev !== 0)
        ? ((price - prev) / prev) * 100
        : (Number.isFinite(j.dp) ? j.dp : null);

      results.push({
        symbol: t,
        price,
        changePercent: Number.isFinite(dp) ? dp : null,
        prevClose: prev,
        time: j.t ? new Date(j.t * 1000).toISOString() : null,
        source: "Finnhub"
      });

      // be gentle with free tier
      await new Promise(r => setTimeout(r, 75));
    }

    res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=30");
    res.status(200).json({ data: results });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
