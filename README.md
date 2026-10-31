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

## Trying it as different users

Locally you're `DEV_USER` from `.env`. To act as someone else, send the auth header yourself:

```sh
curl -H 'remote-email: sam@example.com' http://localhost:5173/
```

## Deploying to the Pi

1. **Build and push the arm64 image** (Docker with buildx, e.g. Rancher Desktop). Log in once with
   `docker login ghcr.io` using a GitHub token that has `write:packages`.

   ```sh
   docker buildx build --platform linux/arm64 -t ghcr.io/harrisonwaffel/poker-tracker:latest --push .
   ```

   GHCR packages start private. Either make the package public in GitHub's package settings, or add an
   `imagePullSecrets` entry to `k8s/deployment.yaml`.

2. **Apply the manifests** (or import them in Rancher: _Import YAML_, pick a namespace):

   ```sh
   kubectl create namespace poker
   kubectl apply -n poker -f k8s/
   ```

3. **Expose it through Pangolin.** Add a resource pointing at `http://poker-tracker.poker.svc:80` (Newt must
   run inside the cluster to reach a ClusterIP Service) and turn on SSO for it.

4. **Check the identity header.** Open the app through Pangolin. Your email should show in the top right.
   If you get "Not signed in: missing the "remote-email" header", find the header your Pangolin version sends
   and set `AUTH_EMAIL_HEADER` in `k8s/deployment.yaml`.

Redeploy after pushing a new image: `kubectl -n poker rollout restart deploy/poker-tracker`.

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
