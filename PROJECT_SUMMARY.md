# Poker Tracker: Project Summary

## Goal

An attractive web app to track poker totals for a friend group.

- One person acts as the **bank**.
- Each player buys in once per night, and again if they keep losing (rebuys).
- **Everyone** can view totals; the **bank** has most control (edits buy-ins, rebuys, cash-outs).

## Infrastructure (self-hosted)

- Raspberry Pi running **k3s**, managed with **Rancher**
- **Pangolin** exposes web apps behind **SSO**
- Everything must be self-hosted (low cost, simple)

## Chosen stack

- **SvelteKit** (Node adapter), packaged as one container
- **SQLite** via **Drizzle ORM**
- **Tailwind CSS + DaisyUI** for styling
- Alternatives considered: Next.js + SQLite (heavier on the Pi), PocketBase (its login overlaps with Pangolin SSO). Supabase and Firebase were ruled out because the app must be self-hosted.

## Key design decisions

- **Auth:** Pangolin handles SSO. The app reads the logged-in user from identity headers Pangolin forwards (check the exact header names for your Pangolin version).
- **Roles:** the bank is set by an env allowlist (e.g. `BANK_EMAILS=...`). The bank can edit; everyone else is read-only.
- **Storage:** the SQLite file lives on a k3s PersistentVolume (local-path provisioner). Back it up by copying the single file.
- **Build:** multi-arch / **arm64** images (`docker buildx --platform linux/arm64`), pushed to GHCR or a local registry, deployed via Rancher.
- **Live updates:** simple short polling (every few seconds) is enough. No websockets needed.

## Status

Planning only. Nothing has been implemented yet.

## Next steps

1. Scaffold the SvelteKit app with Tailwind/DaisyUI and Drizzle + SQLite.
2. Define the data model (players, nights/sessions, buy-ins/rebuys, cash-outs, running totals).
3. Add header-based auth and bank-only edit permissions.
4. Write the Dockerfile (arm64) and k8s manifests (Deployment, Service, PVC).
5. Deploy via Rancher and expose it through Pangolin.
