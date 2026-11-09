# Proposed upstream contribution to free-exercise-db (#950)

Status: **waiting for the owner's OK.** Nothing has been posted upstream.

RepBunny's exercise library started from [free-exercise-db](https://github.com/yuhonas/free-exercise-db)
(Unlicense; see `docs/exercise-library-source.md`). This is what could go back.

## What upstream looks like

- One JSON file per exercise under `exercises/`, validated by the upstream schema (schema.json), merged into `dist/exercises.json` by `make`.
- Required fields: `id`, `name`, `level`, `mechanic`, `equipment`, `primaryMuscles`, `secondaryMuscles`, `instructions`, `category`, `images`.
- **No aliases field and no contributing guide** (the README says to "read the contribution guidelines", which don't exist in the repo). Every new exercise needs images, which RepBunny doesn't have, so adding new entries isn't practical.

## Proposed change (one PR)

1. Add an optional `aliases` array of strings to the upstream schema (schema.json) (not required, so existing files stay valid).
2. Add `aliases` to the exercise files RepBunny matched or imported: the other names people type for it (brand names, short names, plurals, abbreviations such as "Pec Dec", "OHP", "DB Bench").
3. Leave out RepBunny's rewritten how-to text, its load types, movement groups, and equipment wording (RepBunny's own).

Size: 296 source exercises get aliases (list below). Regenerate the list with:

```
git clone https://github.com/yuhonas/free-exercise-db
git -C free-exercise-db checkout f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5
node scripts/exercise-import/upstream-proposal.mjs free-exercise-db/dist/exercises.json --md
```

Not proposed: duplicate merges (RepBunny's merges are about its own list, not the source's) and muscle-group
fixes (RepBunny's groups are coarser than upstream's muscles, so there are no like-for-like corrections to send).

## Draft PR text

> **Add optional `aliases` to the schema and to common exercises**
>
> Apps that search this dataset miss exercises people know by another name ("Pec Dec" for Butterfly,
> "OHP" for Standing Military Press, "Hex Bar Deadlift" for Trap Bar Deadlift). This adds an optional
> `aliases` string array to the upstream schema (schema.json) and fills it for ~300 exercises. No existing field changes
> and the new field isn't required. I'm happy to contribute this under the Unlicense/public domain.

## Decision needed

Open the PR as drafted, change it, or skip it. Contributions there become public domain, and the PR
should be opened from your GitHub account.
