module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  try {
    const { disease, region, country, age, farmType, photoAnalysis, imageBase64, imageMediaType, images, vetSearch, city } = req.body;

    // ── VET SEARCH MODE (fast, no web search) ──
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
      try { return res.status(200).json(JSON.parse(t.replace(/```json\s*/g,'').replace(/```/g,'').trim())); }
      catch(e) { const m = t.match(/\{[\s\S]*"vets"[\s\S]*\}/); return m ? res.status(200).json(JSON.parse(m[0])) : res.status(200).json({vets:[],note:'Contactez la Direction de l\'Elevage locale.'}); }
    }

    // ── PHOTO ANALYSIS MODE (sonnet for vision) ──
    if (photoAnalysis && (imageBase64 || (images && images.length))) {
      const parts = [];
      if (images && images.length) {
        images.forEach(img => { parts.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } }); });
      } else if (imageBase64) {
        parts.push({ type: 'image', source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 } });
      }
      parts.push({ type: 'text', text: `Tu es un veterinaire aviaire expert en Afrique. Analyse ces photos. Reponds UNIQUEMENT en JSON: {"diagnosis":"Nom maladie","confidence":"Elevee/Moyenne/Faible","urgency":"URGENT/MODERE/PEU URGENT","symptoms_observed":["..."],"description":"Explication simple","immediate_actions":["Action 1","Action 2","Action 3"],"differential":["Autre maladie possible"],"what_to_tell_vet":"Resume en 2 phrases"}. Si photo pas claire, dis-le.` });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: parts }] })
      });
      if (!r.ok) return res.status(r.status).json({ error: 'Photo analysis failed', details: await r.text() });
      const d = await r.json();
      let t = ''; d.content?.forEach(b => { if (b.type === 'text') t += b.text; });
      try { return res.status(200).json(JSON.parse(t.replace(/```json\s*/g,'').replace(/```/g,'').trim())); }
      catch(e) { const m = t.match(/\{[\s\S]*"diagnosis"[\s\S]*\}/); return m ? res.status(200).json(JSON.parse(m[0])) : res.status(200).json({diagnosis:'Analyse non concluante',description:t,symptoms_observed:[],immediate_actions:['Consultez un veterinaire']}); }
    }

    // ── MEDICATION SEARCH MODE (haiku, fast, no web search) ──
    if (!disease || !region || !country) return res.status(400).json({ error: 'Missing fields' });

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{ role: 'user', content: `Expert veterinaire avicole en Afrique. Maladie: ${disease}. Lieu: ${region}, ${country}. Age: ${age||'?'}. Elevage: ${farmType||'?'}.

Liste 4-5 medicaments veterinaires disponibles en Afrique francophone pour traiter cette maladie. Reponds UNIQUEMENT en JSON:
{"medications":[{"name":"Nom commercial","molecule":"Molecule active","lab":"Laboratoire","dosage":"Posologie precise","duration":"Duree traitement","where":"Ou acheter (pharmacie veto, provenderie...)","price_range":"Prix en FCFA","warnings":"Precautions"}],"emergency_note":"Conseil urgence","vet_contacts":"Comment trouver un veto"}

Priorise les marques connues en Afrique: Laprovet, Ceva, MCI, Vetoquinol, Hipra. Prix en FCFA.` }]
      })
    });

    if (!r.ok) return res.status(r.status).json({ error: 'API error', details: await r.text() });
    const d = await r.json();
    let t = ''; d.content?.forEach(b => { if (b.type === 'text') t += b.text; });
    try { return res.status(200).json(JSON.parse(t.replace(/```json\s*/g,'').replace(/```/g,'').trim())); }
    catch(e) { const m = t.match(/\{[\s\S]*"medications"[\s\S]*\}/); return m ? res.status(200).json(JSON.parse(m[0])) : res.status(200).json({medications:[],emergency_note:'Consultez un veterinaire local.',vet_contacts:'',raw_response:t}); }

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
