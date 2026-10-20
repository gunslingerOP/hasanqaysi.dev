---
title: Rebuilding a production browser extension
date: 2026-03-15
dek: What I'd tell myself before starting a ground-up extension rebuild.
tags: [frontend, chrome]
plate: ring-dots
scene: rider
---

A ground-up rebuild of a shipping product is a trust exercise. People rely on the old thing every day, so the new one has to be better the moment it lands — not eventually.

## Parity first, then ambition

I rebuilt the extension feature-for-feature before adding anything new. It's tempting to redesign while you rewrite; resist it. Match behavior exactly, ship, then improve from a stable base.

Manifest V3, a clean message layer between content script and background, and a UI system shared with the web app. The rewrite paid for itself the first time a new feature shipped to both surfaces at once.
