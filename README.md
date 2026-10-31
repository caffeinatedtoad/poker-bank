# Poker Tracker

A small, self-hosted web app for keeping score at home poker games. One person acts as the bank: they record
buy-ins and cash-outs, and everyone at the table can see who's in the green and who's in the red. It's built for
phones and runs as a single container on Kubernetes, behind an SSO proxy such as [Pangolin](https://github.com/fosrl/pangolin).

## Features

- **Groups with their own bank.** Anyone signed in can create a group and becomes its bank. Everyone else can view.
- **One-tap buy-ins** with a confirmation, an Undo toast, and an adjustable amount (−/+ $5 or a custom value).
- **Cash-outs** at the end of the night: enter a player's chips and see them land in the green or the red.
- **Full history per player**, with any mistaken buy-in removable, and a chart of how their night went.
- **Set or clear** a balance directly, always behind a confirmation that shows the before and after.
- **Live updates** for everyone watching, every 5 seconds.
- **Mobile first:** large touch targets, thumb-reach controls, light and dark themes, and Add to Home Screen support.

## How it works

- **Sign-in is handled by your proxy.** The app has no login of its own. It reads the signed-in user's email from
  a request header set by the proxy (`remote-email` by default) and rejects requests without it.
- **Balances are an append-only ledger** in SQLite. A balance is the sum of its entries, so clears and
  corrections never erase history.
- **Stack:** SvelteKit (Node adapter), SQLite via Drizzle ORM, Tailwind CSS with DaisyUI.

## Install

You need a Kubernetes cluster with a storage class (k3s's `local-path` is the default) and an identity-aware
proxy that forwards the signed-in user's email as a header.

```sh
helm repo add poker-tracker https://caffeinatedtoad.github.io/poker-bank
helm repo update
helm upgrade --install poker-tracker poker-tracker/poker-tracker -n poker --create-namespace
```

Then point your proxy at `http://poker-tracker.poker.svc:80` (it must run inside the cluster to reach the
ClusterIP Service) and enable SSO for it. Open the app through the proxy and your email appears in the top
right. If you see `Not signed in: missing the "remote-email" header`, set the header name your proxy uses:

```sh
helm upgrade poker-tracker poker-tracker/poker-tracker -n poker --reuse-values --set auth.emailHeader=<header>
```

On a phone, open the app and choose **Share → Add to Home Screen** to get a full-screen app with its own icon.

### Configuration

| Value                      | Default                              | Description                                                |
| -------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| `image.repository`         | `ghcr.io/caffeinatedtoad/poker-bank` | Container image                                            |
| `image.tag`                | the chart's `appVersion`             | Image tag; each chart version pins the image built with it |
| `image.pullPolicy`         | `IfNotPresent`                       | Image pull policy                                          |
| `imagePullSecrets`         | `[]`                                 | Pull secrets, if you use a private image                   |
| `auth.emailHeader`         | `remote-email`                       | Header your proxy uses for the signed-in user's email      |
| `persistence.storageClass` | `local-path`                         | Storage class for the SQLite volume                        |
| `persistence.size`         | `1Gi`                                | Size of the SQLite volume                                  |
| `service.port`             | `80`                                 | Service port                                               |
| `resources`                | 50m CPU / 64Mi requested, 256Mi max  | Container resources                                        |

The chart always runs a single replica with the `Recreate` strategy, because SQLite allows only one writer.
The data volume is kept on `helm uninstall`, and reinstalling with the same release name reuses it.

### Upgrading

```sh
helm repo update
helm upgrade poker-tracker poker-tracker/poker-tracker -n poker --reuse-values
```

### Security

The app trusts the identity header completely, so **anything that can reach the pod directly can claim to be
any user**. The chart's Service is always `ClusterIP`. Don't add a NodePort, LoadBalancer or Ingress that
bypasses your proxy.

### Backups

SQLite runs in WAL mode, so copying `poker.db` while the app is running can miss recent changes. Take a
consistent snapshot instead:

```sh
kubectl -n poker exec deploy/poker-tracker -- node -e \
  "require('better-sqlite3')('/data/poker.db').backup('/data/backup.db').then(() => console.log('ok'))"
pod=$(kubectl -n poker get pod -l app.kubernetes.io/name=poker-tracker -o name | cut -d/ -f2)
kubectl -n poker cp "$pod:/data/backup.db" ./poker-backup.db
```

## Development

Requires Node 22 (pinned in `.nvmrc`) and npm 11. npm 10 fails on this dependency tree.

```sh
nvm use
npm install -g npm@11
npm install
cp .env.example .env    # sets DEV_USER, the email you act as locally
npm run dev             # http://localhost:5173
```

| Command               | Description                                                         |
| --------------------- | ------------------------------------------------------------------- |
| `npm run dev`         | Dev server with hot reload                                          |
| `npm test`            | Unit tests (`npm run test:unit` for watch mode)                     |
| `npm run check`       | Type-check TypeScript and Svelte                                    |
| `npm run format`      | Format with Prettier                                                |
| `npm run build`       | Production build into `build/`                                      |
| `npm start`           | Run the production build with `.env` loaded                         |
| `npm run db:generate` | Create a SQL migration after changing `src/lib/server/db/schema.ts` |
| `npm run db:studio`   | Browse the local database                                           |

To act as another user locally, send the identity header yourself:

```sh
curl -H 'remote-email: sam@example.com' http://localhost:5173/
```

`npm start` behaves like production: CSRF protection is on and the server assumes HTTPS, so form posts over
plain `http://localhost` are rejected. Use `npm run dev` for local work.

[LEARNING.md](LEARNING.md) walks through the codebase for developers coming from Go and backend work.

## Releasing

Releases are driven by `charts/poker-tracker/Chart.yaml`. Bump the version and push to `main`:

| Change                                    | Bump                           |
| ----------------------------------------- | ------------------------------ |
| App code, the Dockerfile, or dependencies | `version` **and** `appVersion` |
| Chart only (templates or values)          | `version`                      |

The [release workflow](.github/workflows/release.yml) runs the tests and then publishes anything new:

- the image `ghcr.io/caffeinatedtoad/poker-bank:<appVersion>` for arm64 and amd64 (existing tags are never overwritten)
- the chart as a GitHub release, with the Helm repository index on the `gh-pages` branch served by GitHub Pages

A push that doesn't bump a version runs the tests and publishes nothing.
