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

## Releasing (GitHub Actions)

`.github/workflows/release.yml` runs on every push to `main`. It runs the tests, then publishes only what's new:

- **Image:** `ghcr.io/harrisonwaffel/poker-tracker:<appVersion>` (and `:latest`) for arm64 and amd64, if that tag
  doesn't exist yet. Published tags are never overwritten.
- **Chart:** a GitHub release with the packaged chart, plus an updated `index.yaml` on the `gh-pages` branch, if
  the chart's `version` hasn't been released yet. GitHub Pages serves that branch as a Helm repository.

**To release**, edit `charts/poker-tracker/Chart.yaml`, then commit and push to `main`:

| What changed                                                  | Bump                           |
| ------------------------------------------------------------- | ------------------------------ |
| The app (any code under `src/`, the Dockerfile, dependencies) | `version` **and** `appVersion` |
| Only the chart (templates, values)                            | `version`                      |

**One-time setup on GitHub:**

1. Create the repo (`HarrisonWAffel/poker-tracker`; the image and Pages URLs below assume that name) and push
   both branches: `git remote add origin <url> && git push -u origin main gh-pages`.
2. **Settings → Pages:** Source _Deploy from a branch_, branch `gh-pages`, folder `/ (root)`.
3. After the first run, open the package (your profile → Packages → poker-tracker) and set its visibility to
   **public**, or use a pull secret (see `imagePullSecrets` in `values.yaml`).

Pages and release downloads need the repo to be **public**, unless you're on a paid GitHub plan. Helm fetches
the chart without logging in.

## Deploying to the Pi

The Helm chart in `charts/poker-tracker` creates the Deployment, a ClusterIP Service and the data volume.
Settings you might change are in `charts/poker-tracker/values.yaml`.

1. **Install from the Helm repository** (with your kubeconfig pointing at the Pi's cluster):

   ```sh
   helm repo add poker-tracker https://harrisonwaffel.github.io/poker-tracker
   helm repo update
   helm upgrade --install poker-tracker poker-tracker/poker-tracker -n poker --create-namespace
   ```

   To upgrade after a release, run `helm repo update` and the same `helm upgrade --install` again.
   In Rancher you can instead add the URL under **Apps → Repositories** and install it from **Apps → Charts**.

2. **Or deploy from this checkout without a release.** Build and push an image whose tag matches `appVersion`,
   then install the local chart:

   ```sh
   docker buildx build --platform linux/arm64 -t ghcr.io/harrisonwaffel/poker-tracker:0.1.0 --push .
   helm upgrade --install poker-tracker charts/poker-tracker -n poker --create-namespace
   ```

   `helm template poker-tracker charts/poker-tracker` prints the plain YAML to see exactly what gets applied.

3. **Expose it through Pangolin.** Add a resource pointing at `http://poker-tracker.poker.svc:80` (Newt must
   run inside the cluster to reach a ClusterIP Service) and turn on SSO for it.

4. **Check the identity header.** Open the app through Pangolin. Your email should show in the top right.
   If you get "Not signed in: missing the "remote-email" header", find the header your Pangolin version sends:

   ```sh
   helm upgrade poker-tracker poker-tracker/poker-tracker -n poker --reuse-values --set auth.emailHeader=<header>
   ```

   (Use `charts/poker-tracker` in place of `poker-tracker/poker-tracker` if you installed from a checkout.)

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
