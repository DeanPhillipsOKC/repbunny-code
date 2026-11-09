# exercise-library.json

The bundled exercise library (issues #41, #842, #850, #851): 355 everyday gym exercises, each with a muscle
group, a RepBunny load type, and short how-to steps.

## Source and license

The exercise selection started from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(`dist/exercises.json`), released under the **Unlicense** (public domain). Names, groups, load types,
and how-to text were curated and rewritten for RepBunny. Entries the dataset lacks (for example the
assisted pull-up and assisted dip machines) were written from scratch.

Issue #842 grew it from 138 to 323 entries with `scripts/import-exercises.mjs`, which reads the
picks, matches, and review list in `scripts/exercise-import/curation.mjs`. Add more exercises from
the source there and re-run the importer rather than editing this file by hand. The source commit,
license, and curation rules are in `docs/exercise-library-source.md`.

Issue #850 added 35 hand-written entries the source lacks (Burpee, Jumping Jack, Air Bike, Ab
Glider Machine, and more), placed after the original 138 so the importer treats them as originals
and keeps them. Aliases on imported entries go in `curation.mjs`, since a re-run rebuilds those
entries; aliases on original and hand-written entries go in this file.

Issue #851 merged three duplicates into the entry they repeated (the removed name became an alias)
and added common short names (OHP, RDL, DB and BB forms, plurals). To merge an imported entry,
move its pick to `MATCHES` in `curation.mjs` and re-run the importer.

## Rules

`npm run check:library` enforces them (`scripts/check-exercise-library.mjs`):

- 300 to 400 entries, unique permanent `id`s (`exercises.library_id` stores them). Removing an
  id (a merge) should come with a SQLite migration (`src/data/sqlite/schema.ts`) that repoints
  `exercises.library_id` to the kept id. Without one, the app reads an id that names no entry as
  unlinked (`src/stores/exercises.ts`), so the exercise keeps working as a custom one.
- No duplicate name or alias across the whole list (case-insensitive).
- `muscleGroup` and `alsoWorks` use the groups in `src/lib/muscleGroups.ts`; `alsoWorks` has 0 to 2
  groups and never repeats `muscleGroup`.
- `loadType` is one of the app's load types. `tracks*` flags are true only for `timed` exercises.
- `equipmentType` and `movement` come from the lists in the script (issue #150's swap suggestions
  rank alternatives by them). A new entry picks the closest existing movement.
- `howTo` is 3 to 5 steps, each under 160 characters.
