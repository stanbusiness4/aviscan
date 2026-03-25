# 🐔 AviaScan by HORIZON AGRO-PASTORAL — Guide de Déploiement sur Vercel

## Étape 1 : Créer votre clé API Anthropic

1. Allez sur **https://console.anthropic.com**
2. Cliquez "Sign Up" et créez un compte (email + mot de passe)
3. Une fois connecté, allez dans **Settings > API Keys**
4. Cliquez **"Create Key"**
5. Copiez la clé générée (elle commence par `sk-ant-api03-...`)
   ⚠️ Gardez-la secrète ! Ne la partagez jamais.
6. Allez dans **Settings > Billing** et ajoutez un moyen de paiement
   → 5$ suffisent pour des milliers de recherches

## Étape 2 : Déployer sur Vercel

### Option A — Via GitHub (recommandé)

1. Créez un compte sur **https://github.com** si vous n'en avez pas
2. Créez un nouveau repository (bouton "+" en haut à droite > New repository)
3. Nommez-le `horizon-agro-pastoral` et cliquez "Create repository"
4. Uploadez tous les fichiers de ce dossier dans le repository :
   - `api/search-meds.js`
   - `public/index.html`
   - `vercel.json`
   - `package.json`
5. Allez sur **https://vercel.com** et connectez-vous avec GitHub
6. Cliquez **"Import Project"** et sélectionnez votre repo `horizon-agro-pastoral`
7. **IMPORTANT** — Avant de cliquer "Deploy", ajoutez la variable d'environnement :
   - Cliquez "Environment Variables"
   - Name : `ANTHROPIC_API_KEY`
   - Value : collez votre clé API (sk-ant-api03-...)
8. Cliquez **"Deploy"**
9. Votre app est en ligne ! Vercel vous donne une URL comme `horizon-agro-pastoral.vercel.app`

### Option B — Via Vercel CLI (pour les techniciens)

1. Installez Node.js : https://nodejs.org
2. Installez Vercel CLI : `npm install -g vercel`
3. Dans le dossier du projet, tapez : `vercel`
4. Suivez les instructions
5. Ajoutez la variable : `vercel env add ANTHROPIC_API_KEY`
6. Redéployez : `vercel --prod`

## Étape 3 : Configurer le Google Sheet

Votre Google Sheet est déjà configuré dans l'app.
Pour modifier les emails autorisés, éditez simplement votre feuille Google :
→ https://docs.google.com/spreadsheets

## Structure du projet

```
horizon-agro-pastoral/
├── api/
│   └── search-meds.js     ← Fonction serveur (appelle Claude API)
├── public/
│   └── index.html          ← L'application web
├── vercel.json              ← Configuration Vercel
├── package.json             ← Métadonnées du projet
└── LISEZMOI.md              ← Ce fichier
```

## Comment ça marche

1. L'utilisateur fait un diagnostic dans l'app
2. Il clique sur "Recherche IA" pour les médicaments
3. L'app appelle `/api/search-meds` (votre serveur Vercel)
4. Le serveur appelle Claude avec recherche web activée
5. Claude recherche les médicaments disponibles dans la localité
6. Les résultats sont affichés à l'utilisateur

La clé API est stockée en sécurité côté serveur (variable d'environnement).
Elle n'est jamais visible par les utilisateurs de l'app.

## Coûts estimés

- **Vercel** : Gratuit (plan Hobby, suffisant)
- **Anthropic API** : ~0.003$ par recherche (soit ~1500 recherches pour 5$)
- **Google Sheets** : Gratuit

## Support

En cas de problème, vérifiez :
1. Que la clé API est bien ajoutée dans Vercel (Settings > Environment Variables)
2. Que le Google Sheet est bien publié sur le web
3. Les logs dans Vercel (Dashboard > votre projet > Logs)
