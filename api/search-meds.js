module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const { disease, region, country, age, farmType, photoAnalysis, imageBase64, imageMediaType, images, vetSearch, city } = req.body;

    // ── VET SEARCH MODE ──
    if (vetSearch && country && city) {
      const vetPrompt = `Tu es un assistant spécialisé en annuaire vétérinaire en Afrique. Recherche les vétérinaires, cliniques vétérinaires, pharmacies vétérinaires et laboratoires d'analyse proches de ${city}, ${country}.

RÉPONDS UNIQUEMENT en JSON valide (pas de texte avant/après, pas de backticks) :
{
  "vets": [
    {
      "name": "Nom du cabinet / clinique / pharmacie / docteur",
      "type": "clinique | pharmacie | labo | service_public | veterinaire",
      "address": "Adresse complète",
      "phone": "Numéro de téléphone avec indicatif pays",
      "whatsapp": "Numéro WhatsApp si disponible (sinon null)",
      "specialty": "Spécialité (volailles, ruminants, général...)",
      "hours": "Horaires d'ouverture si connus (sinon null)"
    }
  ],
  "note": "Note utile pour l'utilisateur (ex: numéro de la direction de l'élevage locale)"
}

Cherche des résultats RÉELS et à jour. Inclus les laboratoires nationaux, les directions régionales de l'élevage, les pharmacies vétérinaires et les cliniques privées. Si tu ne trouves pas d'information fiable, indique-le honnêtement. Donne au minimum 3-5 résultats si possible.`;

      const vetResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages: [{ role: 'user', content: vetPrompt }]
        })
      });

      if (!vetResponse.ok) {
        const errText = await vetResponse.text();
        return res.status(vetResponse.status).json({ error: 'Vet search failed', details: errText });
      }

      const vetData = await vetResponse.json();
      let vetText = '';
      if (vetData.content) {
        for (const block of vetData.content) {
          if (block.type === 'text') vetText += block.text;
        }
      }

      try {
        const cleaned = vetText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        return res.status(200).json(JSON.parse(cleaned));
      } catch (e) {
        const m = vetText.match(/\{[\s\S]*"vets"[\s\S]*\}/);
        if (m) return res.status(200).json(JSON.parse(m[0]));
        return res.status(200).json({ vets: [], note: 'Aucun résultat structuré trouvé. Contactez la Direction de l\'Élevage locale.' });
      }
    }

    // ── PHOTO ANALYSIS MODE ──
    if (photoAnalysis && (imageBase64 || (images && images.length))) {
      const photoPrompt = `Tu es un vétérinaire aviaire expert spécialisé dans les élevages avicoles en Afrique de l'Ouest et Centrale. Tu as 20 ans d'expérience terrain au Bénin, Sénégal, Côte d'Ivoire et Cameroun.

Analyse attentivement CHAQUE photo ci-jointe d'un poulet ou d'un élevage malade. Examine systématiquement :

SIGNES VISUELS À RECHERCHER DANS CHAQUE PHOTO :
- TÊTE : crête (couleur : rouge=normal, pâle=anémie, bleu=cyanose, noir=gangrène), barbillons, gonflement facial, écoulement nasal/oculaire, croûtes/nodules (variole), œdème (coryza), gonflement du crâne (grosse tête)
- YEUX : larmoyants, bulles dans le coin (mycoplasmose), gonflés/fermés, pupille grise (Marek)
- PLUMES : ébouriffées, ternes, zones déplumées, plumes cassées
- PATTES : couleur, épaississement/croûtes (gale), paralysie, position anormale (grand écart = Marek), boiterie, doigts recroquevillés
- FIENTES VISIBLES : couleur (verdâtre=Newcastle/choléra, sanglante=coccidiose, blanche=Gumboro/salmonellose, jaune=foie atteint, mousseuse=entérite)
- POSTURE : prostré, tête penchée, torticolis, ailes tombantes, cou flasque (botulisme), position étoile
- ABDOMEN : gonflé (péritonite, ascite), maigreur du bréchet
- BOUCHE/GORGE : si visible, lésions (variole humide), mucus (candidose)
- LITIÈRE : humidité, état général (indice sur les conditions d'élevage)

MALADIES LES PLUS FRÉQUENTES EN AFRIQUE (par ordre de fréquence) :
1. Newcastle (torticolis, diarrhée verte, signes nerveux)
2. Coccidiose (fientes sanglantes, poussins prostrés)
3. Gumboro (plumes cloaque souillées, fientes blanches, 3-6 semaines)
4. Choléra aviaire (mort subite, crête bleue)
5. Coryza (gonflement facial, odeur)
6. Variole (croûtes cutanées ou lésions buccales)
7. Mycoplasmose CRD (râles, bulles yeux)
8. Marek (paralysie progressive)
9. Bronchite infectieuse (coquilles molles chez pondeuses)
10. Salmonellose (fientes blanches, mortalité poussins)
11. Aspergillose (halètement poussins, litière moisie)
12. Coup de chaleur (halètement, ailes écartées, mortalité massive en journée chaude)
13. Intoxication alimentaire/mycotoxines (amaigrissement progressif)
14. Vers intestinaux (amaigrissement malgré appétit)
15. Gale des pattes (pattes croûtées épaisses)

RÉPONDS UNIQUEMENT en JSON valide (pas de texte avant/après, pas de backticks) :
{
  "diagnosis": "Nom de la maladie la plus probable",
  "confidence": "Élevée / Moyenne / Faible",
  "urgency": "🔴 URGENT / 🟡 MODÉRÉ / 🟢 PEU URGENT",
  "symptoms_observed": ["symptôme 1 observé sur les photos", "symptôme 2", "symptôme 3"],
  "description": "Explication en langage simple de ce que tu vois et pourquoi tu penses à cette maladie. Parle comme si tu expliquais à un éleveur qui n'est pas vétérinaire.",
  "immediate_actions": ["Action CONCRÈTE 1 à faire MAINTENANT", "Action 2", "Action 3", "Action 4"],
  "differential": ["Autre maladie possible 1 — et pourquoi c'est moins probable", "Autre maladie possible 2"],
  "what_to_tell_vet": "Ce que l'éleveur devrait dire au vétérinaire s'il l'appelle (résumé en 2 phrases)"
}

IMPORTANT : Si les photos ne montrent pas clairement un poulet malade, dis-le honnêtement et demande de meilleures photos (plus proches, meilleur éclairage). Ne devine PAS si tu ne vois rien de clair. Mieux vaut dire "je ne vois pas assez" que de donner un mauvais diagnostic.`;

      // Build content array with all images
      const contentParts = [];
      
      if (images && images.length) {
        // Multi-photo mode
        images.forEach((img, i) => {
          contentParts.push({ type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } });
        });
      } else if (imageBase64) {
        // Single photo fallback
        contentParts.push({ type: 'image', source: { type: 'base64', media_type: imageMediaType || 'image/jpeg', data: imageBase64 } });
      }
      
      contentParts.push({ type: 'text', text: photoPrompt });

      const photoResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: contentParts
          }]
        })
      });

      if (!photoResponse.ok) {
        const errText = await photoResponse.text();
        return res.status(photoResponse.status).json({ error: 'Photo analysis failed', details: errText });
      }

      const photoData = await photoResponse.json();
      let photoText = '';
      if (photoData.content) {
        for (const block of photoData.content) {
          if (block.type === 'text') photoText += block.text;
        }
      }

      try {
        const cleaned = photoText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        return res.status(200).json(JSON.parse(cleaned));
      } catch (e) {
        const m = photoText.match(/\{[\s\S]*"diagnosis"[\s\S]*\}/);
        if (m) return res.status(200).json(JSON.parse(m[0]));
        return res.status(200).json({ diagnosis: 'Analyse non concluante', description: photoText, symptoms_observed: [], immediate_actions: ['Consultez un vétérinaire'] });
      }
    }

    // ── MEDICATION SEARCH MODE ──
    if (!disease || !region || !country) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const prompt = `Tu es un expert vétérinaire aviaire en Afrique de l'Ouest et Centrale. 

CONTEXTE :
- Maladie diagnostiquée : ${disease}
- Localisation : ${region}, ${country}
- Âge des poulets : ${age || 'Non précisé'}
- Type d'élevage : ${farmType || 'Non précisé'}

MISSION :
Recherche les médicaments vétérinaires CONVENTIONNELS actuellement disponibles et accessibles dans cette localité pour traiter cette maladie. Utilise la recherche web pour trouver des informations à jour sur les produits vétérinaires disponibles dans cette zone.

RÉPONDS UNIQUEMENT en JSON valide avec cette structure exacte (pas de texte avant ou après, pas de backticks markdown) :
{
  "medications": [
    {
      "name": "Nom commercial du médicament",
      "molecule": "Molécule active",
      "lab": "Laboratoire fabricant",
      "dosage": "Posologie précise adaptée à l'âge des poulets",
      "duration": "Durée du traitement",
      "where": "Où le trouver dans cette localité (pharmacies vétérinaires, provenderies, marchés...)",
      "price_range": "Fourchette de prix estimée en monnaie locale (FCFA, GHS, NGN...)",
      "warnings": "Précautions importantes (délai d'attente, contre-indications...)"
    }
  ],
  "emergency_note": "Conseil d'urgence si applicable",
  "vet_contacts": "Comment trouver un vétérinaire dans cette zone"
}

Donne entre 3 et 6 médicaments, en priorisant ceux réellement disponibles dans cette zone géographique. Inclus des noms commerciaux connus en Afrique francophone (Laprovet, Ceva, MCI, Vetoquinol, Merial, Hipra, etc). Sois précis sur les prix en monnaie locale.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', response.status, errText);
      return res.status(response.status).json({ error: 'API error', details: errText });
    }

    const data = await response.json();

    // Extract text content from response
    let fullText = '';
    if (data.content) {
      for (const block of data.content) {
        if (block.type === 'text') fullText += block.text;
      }
    }

    // Parse JSON from Claude's response
    let result;
    try {
      const cleaned = fullText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      result = JSON.parse(cleaned);
    } catch (e) {
      const jsonMatch = fullText.match(/\{[\s\S]*"medications"[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        return res.status(200).json({
          medications: [],
          emergency_note: "La recherche n'a pas retourné de résultats structurés. Consultez un vétérinaire local.",
          vet_contacts: "",
          raw_response: fullText
        });
      }
    }

    return res.status(200).json(result);

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
