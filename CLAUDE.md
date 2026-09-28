# Rules for this repository

1. No code comments in any language: no `//`, `/* */`, `#`, `--` or `<!-- -->` comments, no doc comments, no commented-out code, no TODO or FIXME markers. `npm run comments:check` enforces this.
2. The only documents are `README.md`, `LICENSE` and, once they exist, the landing page in `site/` and the mod's README. Do not add others.
3. `web/openapi.yaml` is the contract for the site API, the live stream, the collector ingest and the actions the site hands the collector. `npm run api:types` regenerates `web/src/lib/api/types.ts`; the collector's contract test validates its events against the same file.
4. Facts about Palworld come from the game's own code and files, read from the dedicated server build (Steam app 2394010), never from memory. Record the game version each fact was read from.
5. One version number: the root `package.json` `version`. The site and the collector build read it.
6. Work on a branch and merge through a pull request once CI is green. CI runs `npm run verify`; push branches to `origin` (`git@github.com-odd:oddessentials/skylark.git`).
7. Public responses and pages never contain IP addresses or platform user ids.
8. No Pocketpair artwork, logos or extracted game textures in the repository. Derived facts only, and Skylark's own art.
