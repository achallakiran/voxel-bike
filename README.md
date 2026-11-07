# Voxel Bikes

An offline-ready voxel motocross game inspired by NES-era arcade racing. The Redline Series features five closed circuits from 512 to 716 m and a catalog of 19 classic obstacle variants.

- [Play on GitHub Pages](https://achallakiran.github.io/voxel-bike/)
- [Download the self-contained HTML](https://achallakiran.github.io/voxel-bike/Voxel-Bikes-Offline.html) and open it in a WebGL 2 browser.

Use **Z** for throttle, **X** for turbo, **↑/↓** to change lanes, **←/→** to raise or lower the nose, **Space** to brake, **C** to cycle the race camera, and **Esc** to pause. On a touch device, rotate to landscape. In Hero Side, Broadcast and Front Quarter, move the stick vertically to change lanes and horizontally to pitch the bike. In Rear Chase and First Person, use left/right for lanes and down/up to lift/lower the nose. Arrow keys follow the same mapping. The gauge icon controls throttle and the bolt is turbo. Release both to coast.

Practice loops endlessly on all five circuits until you return to Main Menu. Its lap time, best lap and skill score stay in the session. Rival Race offers Easy (default), Medium and Hard opponents.

The Garage starts with a free Trail 125. Completed races earn credits and skill points. Credits buy the Swift 150 or Redline 250 and three levels each of engine, cooling, suspension and tyre upgrades. Purchases and race rewards share one browser save. Practice awards no credits.

Time Trial saves your best run as a ghost when browser storage is available. Rival Race and Time Trial offer 3, 5 or 7 laps, with individual splits and the fastest lap in the results. Next Track starts the next course with the same race settings.

Light and weather default to Random, independently resolving when a new race or Next Track starts. Choose Morning, Noon, Evening or Night and Clear, Rain or Thunderstorm to fix either setting. Restart and Race Again keep the resolved conditions; Practice keeps them until you leave. The transparent circuit map follows each rider, with a white halo around the player and distinct rival colors shared by bikes and podiums. Rain changes braking and lane response. Night uses a headlight and reflective markers. Time Trial compares previous runs for the same conditions and bike configuration, and Rival Race ranks confirmed finishers on the podium.

## Build

Run `npm ci`, `npm run check`, and `npm run build`. The build creates identical standalone HTML files in `dist/`. GitHub Pages serves the static release files at the repository root. For a release, copy `dist/index.html`, `dist/Voxel-Bikes-Offline.html`, and `dist/.nojekyll` to the root, then commit them with the source.
