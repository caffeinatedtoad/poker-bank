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
