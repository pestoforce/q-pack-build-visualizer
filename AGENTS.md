# AI-agent build tracking

This is a printing-progress viewer, not a slicer or authoritative assembly guide.
Use this workflow when a builder reports completing pieces.

## Files and stable identities

- `assets/pack-parts.json`: pack part catalog and example groups.
- `assets/wand-parts.json`: wand part catalog and example groups.
- `progress.json`: blank starter / local working file; an exported file has the
  same format. Ask for the exported file if browser changes are not yet on disk.
- `progress.js`: canonical allowed statuses and validation rules.

Edit **progress only** for ordinary updates. Do not regenerate models, change
catalog defaults, or hardcode totals in HTML to mark pieces done.
Use exact catalog keys, never substring matching: `rear_box` and
`rear_box_plate` are different pieces. Repeated sources have per-copy IDs.
Pack and wand IDs are separate namespaces.

## Required update procedure

1. Read the current progress file and relevant catalog before editing. Preserve
   other entries and notes. Resolve the user-described object(s) by exact name,
   source filename, assembly, variant, and copy count.
2. Ask if identity, quantities, plate membership, or success is ambiguous.
   Example plate IDs are not universal slicer/job IDs. A builder's "plate 7"
   is not automatically this viewer's `plate07`.
3. Change only explicitly confirmed successful pieces to `printed`.
   "Printed and looks good" is still `printed`, not `fit_checked`.
   Sliced/queued/printing pieces are not completed. Failed pieces may become
   `needs_rework`; do not mark an entire partially failed group done.
4. Mark `fit_checked`, `assembled`, or `finished` only with explicit confirmation
   of that milestone. Preserve later stages unless the builder explicitly
   reports rework or asks to correct the record.
5. Use the format below. Include an ISO-8601 `updated_at` when the time is known.
   A short `note` is optional (maximum 1,000 characters). Never invent actual
   print times, material consumption, inspection results, or finish dates.
6. Run `npm run validate` from the repository root. For an exported file at a
   different location use `node scripts/validate.cjs --progress <path>`.
7. Summarize exact changed IDs and statuses. Tell the builder to **Import
   Progress** in the viewer. Reloading alone will not override browser storage.

Example (one completed piece; preserve any existing entries):

```json
{
  "version": 1,
  "parts": {
    "pack": {
      "pack_Cyclotron_Window_Top_x2_L_XL_XXL_01": {
        "status": "printed",
        "note": "Printed successfully; mating fit pending."
      }
    },
    "wand": {}
  }
}
```

Allowed statuses: `pending`, `sliced`, `printing`, `printed`, `fit_checked`,
`assembled`, `finished`, `needs_rework`. Print credit is given only to `printed`
and later stages, and only across modeled pieces. Do not report these counts as
completion of the entire physical pack.

## Privacy and safety boundaries

Do not push a builder's progress or notes to a public repository without their
explicit approval. Keep purchased PDFs, access links, receipts, personal data,
credentials, and machine-specific paths out of commits. Link to public creator
resources instead of reproducing guide contents.

Never send printer commands, upload G-code, or change slicer presets from a
progress update. Assembly preview poses do not establish print orientation or
load-bearing suitability. Follow the original guide and inspect mating features.

## Code changes

Viewer code is MIT; Q-Pack assets and derived data retain CC BY-NC-SA 4.0.
Keep exact model/catalog identity invariants and per-copy tracking. Run
`npm run validate` for data changes and `npm test` for behavior changes.
Private build data must never become published catalog defaults.
