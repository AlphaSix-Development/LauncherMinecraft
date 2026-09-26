# Launcher Minecraft — Auth (sans lancement de jeu pour l'instant)

## Structure
```
LauncherMinecraft/
├── launcher/           # App Electron (login / register / écran connecté)
│   ├── config.json     # <-- URL de l'API à changer en prod
│   ├── main.js
│   ├── preload.js
│   └── renderer/ (index.html, styles.css, app.js)
├── server/             # API Node Express + MySQL + JWT
│   ├── src/index.js
│   ├── src/db.js
│   ├── src/routes/auth.js
│   └── schema.sql
├── docker-compose.yml  # API + MySQL sur le MEME serveur
└── .env.example
```

## 1. Héberger API + BDD sur le même serveur (prod)

Sur ton serveur (VPS / dédié avec Docker) :

```bash
cp .env.example .env
# édite .env : DB_PASSWORD + JWT_SECRET long
nano .env

docker compose up -d --build
docker compose logs -f api
```

Vérif : `curl http://TON_IP_SERVEUR:3000/api/health` → `{"ok":true,...}`

> API + MySQL tournent sur la même machine, reliés par le réseau Docker interne (`DB_HOST=db`). C'est ce que tu voulais.

Sécurité prod :
- change `JWT_SECRET` (32+ caractères aléatoires)
- ouvre le port 3000 (ou mets un reverse proxy Nginx + HTTPS)
- `DB_PASSWORD` fort

## 2. Lancer l'API en local (dev, sans Docker)

Nécessite MySQL local, ou utilise Docker juste pour la DB :
```bash
cd server
cp .env.example .env
npm install
npm run dev
# -> http://localhost:3000/api/health
```

## 3. Lancer le launcher (dev)

```bash
cd launcher
npm install
npm start
```

En prod, pointe le launcher vers ton serveur : édite `launcher/config.json` :
```json
{ "apiUrl": "http://TON_IP_SERVEUR:3000", "serverName": "Mon Serveur" }
```
Puis build l'exe :
```bash
npm run dist
# -> dist/MonLauncher-Setup-0.1.0.exe
```

## 4. Endpoints API

- `POST /api/auth/register` `{ username, email, password }` → `{ token, user }`
- `POST /api/auth/login` `{ identifier, password }` → `{ token, user }`
- `GET /api/auth/me` header `Authorization: Bearer <token>` → `{ user }`
- `GET /api/health`

## Étape suivante (quand tu veux)
- lancement jeu (authlib / minecraft-launcher-core)
- mot de passe oublié, vérif email, rôles, skin/avatar
"# LauncherMinecraft" 
