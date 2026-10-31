# Poker Tracker

Tracks how much each player owes the bank during poker nights. Self-hosted on k3s behind Pangolin SSO.
See `PROJECT_SUMMARY.md` for the background and `LEARNING.md` for how the code maps to Go concepts.

## Setup

Requires Node 22 (pinned in `.nvmrc`) and npm 11. npm 10 crashes on this dependency tree with
`Cannot read properties of null (reading 'edgesOut')`.

```sh
nvm use            # picks Node 22 from .nvmrc
npm i -g npm@11    # once per Node install
npm install
cp .env.example .env
```

## Everyday commands

| Command             | What it does                                                               | Go equivalent              |
| ------------------- | -------------------------------------------------------------------------- | -------------------------- |
| `npm run dev`       | Dev server on http://localhost:5173 with hot reload                        | `go run .` (with `air`)    |
| `npm test`          | Run unit tests once                                                        | `go test ./...`            |
| `npm run test:unit` | Run tests in watch mode                                                    | —                          |
| `npm run check`     | Type-check TypeScript and Svelte files                                     | `go vet` / compiler errors |
| `npm run format`    | Format all files with Prettier                                             | `gofmt -w .`               |
| `npm run build`     | Production build into `build/`                                             | `go build`                 |
| `npm start`         | Run the production build with `.env` loaded (`node --env-file=.env build`) | `./poker-tracker`          |

`npm start` behaves like production. CSRF protection is on, and the server assumes `https` (true behind Pangolin),
so forms posted over plain `http://localhost` are rejected. Use `npm run dev` for local work.

## On your phone

Open the app in Safari (or Chrome on Android), then **Share → Add to Home Screen**. It gets the chip icon and opens
full screen like an app.

## Trying it as different users

Locally you're `DEV_USER` from `.env`. To act as someone else, send the auth header yourself:

```sh
curl -H 'remote-email: sam@example.com' http://localhost:5173/
```

## Deploying to the Pi

The Helm chart in `charts/poker-tracker` creates the Deployment, a ClusterIP Service and the data volume.
Settings you might change are in `charts/poker-tracker/values.yaml`.

1. **Build and push the arm64 image** (Docker with buildx, e.g. Rancher Desktop). Log in once with
   `docker login ghcr.io` using a GitHub token that has `write:packages`. The tag must match the chart's
   `appVersion` in `charts/poker-tracker/Chart.yaml`.

   ```sh
   docker buildx build --platform linux/arm64 -t ghcr.io/harrisonwaffel/poker-tracker:0.1.0 --push .
   ```

   GHCR packages start private. Either make the package public in GitHub's package settings, or create a pull
   secret and pass it to the chart (`values.yaml` shows how, under `imagePullSecrets`).

2. **Install the chart** (with your kubeconfig pointing at the Pi's cluster):

   ```sh
   helm upgrade --install poker-tracker charts/poker-tracker -n poker --create-namespace
   ```

   Run the same command again to apply changes. `helm template poker-tracker charts/poker-tracker` prints the
   plain YAML if you want to see exactly what gets applied.

3. **Expose it through Pangolin.** Add a resource pointing at `http://poker-tracker.poker.svc:80` (Newt must
   run inside the cluster to reach a ClusterIP Service) and turn on SSO for it.

4. **Check the identity header.** Open the app through Pangolin. Your email should show in the top right.
   If you get "Not signed in: missing the "remote-email" header", find the header your Pangolin version sends:

   ```sh
   helm upgrade poker-tracker charts/poker-tracker -n poker --reuse-values --set auth.emailHeader=<header>
   ```

`helm uninstall poker-tracker -n poker` removes the app but **keeps the data volume**
(`poker-tracker-data`), and reinstalling picks it up again.

### Security model

The app has no login of its own. It trusts the email header from Pangolin, so **anything that can reach the
pod directly can claim to be anyone**. Keep the Service `ClusterIP`, and never add a NodePort, LoadBalancer or
Ingress that bypasses Pangolin.

### Backups

SQLite runs in WAL mode, so the live database is three files (`poker.db`, `-wal`, `-shm`). Copying only
`poker.db` while the app runs can miss recent changes. Take a consistent snapshot instead:

```sh
kubectl -n poker exec deploy/poker-tracker -- node -e \
  "require('better-sqlite3')('/data/poker.db').backup('/data/backup.db').then(() => console.log('ok'))"
kubectl -n poker cp "$(kubectl -n poker get pod -l app=poker-tracker -o name | cut -d/ -f2)":/data/backup.db ./poker-backup.db
```
