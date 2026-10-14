# Q-Pack Build Visualizer

An unofficial interactive 3D assembly and printing-progress viewer for a
Ghostbusters Q-Pack MK4 proton pack and wand.

**[Open the live viewer](https://pestoforce.github.io/q-pack-build-visualizer/)**

[![Q-Pack Build Visualizer showing the proton-pack assembly, print groups, and progress controls](docs/images/proton-pack-preview.png)](https://pestoforce.github.io/q-pack-build-visualizer/)

## Video preview

[![Watch the Q-Pack Build Visualizer preview on YouTube](https://img.youtube.com/vi/SobxEf9ONpw/hqdefault.jpg)](https://www.youtube.com/watch?v=SobxEf9ONpw)

**[Watch the video on YouTube](https://www.youtube.com/watch?v=SobxEf9ONpw)** to see the visualizer in action.
GitHub READMEs do not support embedded YouTube players; the thumbnail opens the video.

Viewer software is **MIT licensed**. Bundled Q-Pack model assets are
**CC BY-NC-SA 4.0**, not MIT: attribution, noncommercial use, and ShareAlike
restrictions apply. See [ATTRIBUTION.md](ATTRIBUTION.md).

## Using the viewer

Switch between **Proton Pack** and **Wand**, orbit/zoom with the mouse, and select a
part to inspect it. Plate cards highlight example groups. Empty-canvas clicks
deselect. Camera presets, an exploded slider, ghost visibility, and **Solid
Preview** help inspect the assembly.

Select a part and change its **Build status**, or select a specific group and use
**Mark highlighted group printed**. Group completion requires confirmation and
does not downgrade fit-checked, assembled, or finished pieces.

Progress starts blank and saves **only in your browser**; it is not uploaded to
GitHub or synced between devices. **Export Progress** downloads `progress.json`
for backups or AI-agent edits. **Import Progress** validates and replaces browser
progress after confirmation. Export before importing to avoid losing changes.
To start over, import the repository's blank `progress.json`.

Statuses: `pending`, `sliced`, `printing`, `printed`, `fit_checked`, `assembled`,
`finished`, `needs_rework`. Green means printed or a later stage, **not** an
automatic fit/assembly approval. Counts include only the **98 modeled pieces**,
not the entire physical build. Failed/rework pieces do not earn print credit.

## Tracking your build with an AI agent

Clone the repository, then tell your coding assistant to read **[AGENTS.md](AGENTS.md)**.
The agent can edit your exported `progress.json` using stable part IDs in
`assets/pack-parts.json` and `assets/wand-parts.json`.

Example prompts:

> Read AGENTS.md. I printed both upper and both lower cyclotron window rings.
> Update my exported progress.json to printed; keep fit checks pending.

> Read AGENTS.md. The rear electrical box is printed and visually looks good.
> Update only that wand piece, not its cover plate.

> Read AGENTS.md. My selected example plate is only partially successful.
> Help identify the successful pieces before updating progress.

The hosted viewer **cannot read an agent's local files automatically**. Export,
give the JSON file to your agent, then import the edited file. When serving a clone,
`progress.json` provides initial progress, but an existing browser save takes
precedence; import the edited file explicitly. Browser changes do not write to disk.
Do not commit private build notes, guides, receipts, addresses, or credentials.

## Run locally

No build step, runtime npm install, or backend is required. Serve the repository
over HTTP rather than opening `index.html` as a file.

```powershell
py -3 -m http.server 8080
```

On macOS/Linux use `python3 -m http.server 8080`. Open <http://localhost:8080/>.
Internet access is currently required for the pinned Three.js CDN scripts.
No analytics or account sign-in is included; CDNs receive ordinary asset requests.

## Sources and guides

| Resource | Original source |
|---|---|
| Printable Q-Pack files | [mr-kiou/q-pack, MK4 branch](https://github.com/mr-kiou/q-pack/tree/MK4) |
| Official MK4 assembly guide (paid, separate purchase) | [Creator's Etsy listing](https://www.etsy.com/listing/1554836449/) |
| Creative Geekery companion resources | [Ghostbusters build resource page](https://www.creativegeekery.com/ghostbusters) |
| Creative Geekery build overview | [Step-by-step guide article](https://www.creativegeekery.com/post/build-your-own-3d-printed-ghostbusters-proton-pack-free-step-by-step-guide) |
| Video 1: printing and assembly | [How to Build a Ghostbusters Proton Pack with 3D Printing (Step-by-Step)](https://www.youtube.com/watch?v=rL9p1oH5JjU) |
| Video 2: optional electronics | [DIY Ghostbusters Proton Pack Electronics (Complete Wiring Guide)](https://www.youtube.com/watch?v=7nHxTb9JlGo) |
| Video 3: weathering | [How I Weathered My Ghostbusters Proton Pack (Full DIY Build Guide)](https://www.youtube.com/watch?v=X9b56DHAqb8) |
| Video creator | [Creative Geekery YouTube channel](https://www.youtube.com/@Creative-Geekery) |
| Q-Pack community linked upstream | [3D Printed Ghostbusters Props Facebook group](https://www.facebook.com/groups/3DprintedGBprops) |

Use the creators' pages for current downloads and support. PDFs and videos are
not included here. Guide references are **PDF page numbers**, which differ from
the guide's printed numbering. Electronics are optional and not represented.

## Model coverage and limitations

Pack: **76 nominal printed pieces**, GB1 fixed cyclotron/bumper and actual L split
shell sections. Wand: **22-object prototype**, not a complete wand BOM.
Major shell offsets are matched to assembled CAD references. Small-detail
placements are illustrative and labeled in the inspector. The wand's rack uses
the ELSA source variant; barrel diameter and cosmetic choices remain provisional.

Example plate groups are not print-ready slicer projects or universal plate
numbers. These poses are **assembly poses, not print-bed orientations**.
Backboard, frame, hardware, hoses, labels, and electronics are not modeled.
Do not infer safe print settings, reliable mating fit, or load-bearing strength
from this viewer. Use the original models and purchased guide for the build.

## Regenerating models

Requires Blender 4.3+ and a separately cloned Q-Pack MK4 checkout. The source
snapshot is pinned in `scripts/build-manifest.json`; upstream originals are not
included or modified.

```powershell
git clone --branch MK4 https://github.com/mr-kiou/q-pack.git q-pack
git -C q-pack checkout bc617e8382c8ad7aa2102e489f50e1aad1dc3a70
& 'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe' --background --python .\scripts\build_pack.py -- --source .\q-pack
& 'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe' --background --python .\scripts\build_wand.py -- --source .\q-pack
```

On other systems replace the Blender executable path. The scripts accept an
external source path, fail on missing geometry, and never edit `progress.json`.
The pack script uses the checked-in catalog alongside the source manifest;
adding geometry requires updating both. Outputs overwrite `assets/*_assembly.glb`
and pack alignment data. Preserve asset attribution/license when sharing remixes.

## Development

```powershell
npm ci
npm run validate
npx playwright install chromium
npm test
```

Validation checks catalogs, stable mesh identities, blank defaults, and progress
format. Browser tests run their own HTTP server and exercise both assemblies,
plate filtering, status persistence/import/export, visibility, and exploded view.
The GitHub Actions workflow runs these checks and publishes only the viewer
files to GitHub Pages.
