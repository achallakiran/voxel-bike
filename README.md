# Voxel Bikes

An offline-ready voxel motocross game inspired by NES-era arcade racing.

- [Play on GitHub Pages](https://achallakiran.github.io/voxel-bike/)
- [Download the self-contained HTML](https://achallakiran.github.io/voxel-bike/Voxel-Bikes-Offline.html) and open it in a WebGL 2 browser.

Use **Z** for throttle, **X** for turbo, **↑/↓** to change lanes, **←/→** to raise or lower the nose, and **Esc** to pause. On a touch device, rotate to landscape for racing.

Time Trial saves your best run as a ghost when browser storage is available. The Track Builder supports JSON import and export, so custom courses can be moved between browsers and played offline.

## Build

Run `npm ci`, `npm run check`, and `npm run build`. The build creates identical standalone HTML files in `dist/`. GitHub Pages serves the static release files at the repository root. For a release, copy `dist/index.html`, `dist/Voxel-Bikes-Offline.html`, and `dist/.nojekyll` to the root, then commit them with the source.
