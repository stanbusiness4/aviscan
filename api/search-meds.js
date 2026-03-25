module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const { vetSearch, city, country } = req.body;

    if (vetSearch && country && city) {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          messages: [{ role: 'user', content: `Liste les veterinaires, cliniques, pharmacies veterinaires et labos proches de ${city}, ${country}. Reponds UNIQUEMENT en JSON: {"vets":[{"name":"...","type":"clinique|pharmacie|labo|veterinaire","address":"...","phone":"...","specialty":"..."}],"note":"..."}. Donne 3-5 resultats reels si possible.` }]
        })
      });
      if (!r.ok) return res.status(r.status).json({ error: 'API error', details: await r.text() });
      const d = await r.json();
      let t = ''; d.content?.forEach(b => { if (b.type === 'text') t += b.text; });
      try { return res.status(200).json(JSON.parse(t.replace(/```json\s*/g, '').replace(/```/g, '').trim())); }
      catch (e) { const m = t.match(/\{[\s\S]*"vets"[\s\S]*\}/); return m ? res.status(200).json(JSON.parse(m[0])) : res.status(200).json({ vets: [], note: 'Contactez la Direction de l\'Elevage locale.' }); }
    }

    return res.status(400).json({ error: 'Missing required fields (vetSearch, city, country)' });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
