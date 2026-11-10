# SnapFlash

Application web mobile (PWA) de partage de photos et vidéos éphémères, inspirée de Snapchat.

## Fonctionnalités

- **Comptes** : inscription / connexion (mots de passe hachés avec scrypt).
- **Amis** : recherche par nom d'utilisateur, demandes d'ami, acceptation, suppression.
- **Caméra** : photo (appui) ou vidéo jusqu'à 10 s (appui long), caméra avant/arrière, import depuis la galerie.
- **Filtres** : 10 filtres (Noir & Blanc, Sépia, Vintage, Chaud, Froid, Néon, Drama, Rêve, Négatif…), en direct sur la caméra et dans l'éditeur (balayer gauche/droite).
- **Éditeur** : texte façon Snapchat (barre déplaçable), autocollants emoji (taper pour agrandir, glisser vers la corbeille pour supprimer), dessin à main levée avec couleurs et annulation, minuteur 1–10 s ou ∞.
- **Snaps éphémères** : envoi à un ou plusieurs amis. Un snap ne peut être ouvert **qu'une seule fois** : le fichier est supprimé du serveur dès l'ouverture. L'expéditeur voit « Envoyé » puis « Ouvert ». Les snaps non ouverts expirent après 30 jours.
- **Stories** : visibles par les amis pendant 24 h, avec la liste des personnes qui les ont vues.
- **Chat éphémère** : messages en temps réel, indicateur « écrit… », accusés de lecture. Les messages lus disparaissent quand on quitte la conversation ; maintenir (ou double-cliquer) un message pour l'enregistrer. Tout message non enregistré expire après 24 h.
- **Temps réel** : notifications instantanées (Socket.IO) pour les snaps, messages, stories et demandes d'ami.

## Stack

- Frontend : React + Vite (`client/`)
- Backend : Node.js, Express, Socket.IO, SQLite intégré (`node:sqlite`), stockage des médias sur disque (`server/`)

## Lancer le projet

Prérequis : Node.js ≥ 22.13.

```bash
npm install
npm run build      # construit le frontend dans dist/
npm start          # http://localhost:3001
```

Développement (rechargement à chaud) dans deux terminaux :

```bash
npm run dev:server # API sur :3001
npm run dev:client # Vite sur :5173 (proxy vers l'API)
```

Variables d'environnement : `PORT` (défaut 3001), `DATA_DIR` (défaut `./data`, base SQLite + médias).

> La caméra du navigateur nécessite HTTPS (ou `localhost`). Sans caméra, l'import depuis la galerie reste disponible.

## Limites connues

- Comme toute app web, la détection des captures d'écran n'est pas possible.
- Pas encore de « lenses » à détection de visage (oreilles de chien, etc.), ni de notifications push hors de l'application.

## Déploiement (Docker / Railway)

Le `Dockerfile` construit le frontend et lance le serveur. Les données (SQLite + médias) sont écrites dans `DATA_DIR` (`/data` dans l'image) : montez-y un volume persistant.

Sur Railway : créez un service depuis ce dépôt (le fichier `railway.json` est pris en compte), ajoutez un volume monté sur `/data`, puis générez un domaine public (HTTPS fourni automatiquement).
