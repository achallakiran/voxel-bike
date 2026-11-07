# Voxel Bikes

An offline-ready voxel motocross game inspired by NES-era arcade racing. The Redline Series features five closed circuits from 512 to 716 m and a catalog of 19 classic obstacle variants.

- [Play on GitHub Pages](https://achallakiran.github.io/voxel-bike/)
- [Download the self-contained HTML](https://achallakiran.github.io/voxel-bike/Voxel-Bikes-Offline.html) and open it in a WebGL 2 browser.

Use **Z** for throttle, **X** for turbo, **↑/↓** to change lanes, **←/→** to raise or lower the nose, **Space** to brake, **C** to cycle the race camera, and **Esc** to pause. On a touch device, rotate to landscape. In Hero Side, Broadcast and Front Quarter, move the stick vertically to change lanes and horizontally to pitch the bike. In Rear Chase and First Person, use left/right for lanes and down/up to lift/lower the nose. Arrow keys follow the same mapping. The gauge icon controls throttle and the bolt is turbo. Release both to coast.

Practice loops endlessly on all five circuits until you return to Main Menu. Its lap time, best lap and skill score stay in the session. Rival Race offers Easy (default), Medium and Hard opponents.

The Garage displays the actual race models in a rotatable showroom with five model previews, free per-bike paint, performance bars and component inspection. Tap an upgrade once to inspect it and again to purchase it. Trail 125 is free; Swift 150 (750 CR) and Redline 250 (1,250 CR) unlock Boulevard 900 cruiser (1,650 CR) and Apex 600 sport bike (2,000 CR) once all three originals are owned. Unlocked bikes still need to be purchased. All five have distinct geometry, cockpit views, engine voices and handling. The Practice shortcut tries the displayed owned bike without awarding credits.

Engine, cooling, suspension and tyre upgrades each have three levels (150 / 300 / 500 CR). Engine levels add 12% acceleration and 4.5% speed per level; cooling levels add 23% cooling capacity, suspension 17% landing support, and tyres 10% grip plus wet control. Visual components change with upgrades. Opponents use real bike configurations: conservative starter/cruiser/stunt bikes on Easy, a broader upgraded lineup on Medium, and competition/sport/stunt bikes on Hard. Rival paints are selected to stay distinct from the player and one another across bikes, map dots and podiums.

Light and weather default to Random. New races and Next Track resolve them independently; Restart and Race Again keep the resolved conditions. Practice keeps its conditions until you leave. Evening adds 5%, Night 15%, Rain 10% and Thunderstorm 20% to eligible skill events and completed-race credits, capped at 35% combined. Rival difficulty adds its existing credit bonus. The finish screen breaks down base, difficulty and condition credits.

Time Trial saves a ghost for matching track, laps, conditions, bike and upgrade configuration. Handling changes in v0.9 use a new record namespace; old records remain stored but are not compared against new physics. Paint does not separate records. Existing credits, ownership and upgrades are preserved. Practice loops indefinitely without credit farming.

Audio includes stronger offline vocal ensembles, applause, whistles, gasps and distance-faded stand ambience, with independent audience volume and a limiter. Spectators wave cheering placards and react with larger, longer gestures. The finish screen has a live voxel podium with celebrating riders, a trophy, confetti, cheering spectators and sustained applause. Reduced motion disables confetti and camera motion. Night uses a headlight; rain affects traction and braking. All gameplay assets and audio work without a network connection.

Races stop immediately when the player finishes. The Rival podium includes the top three racers; unfinished opponents are classified by their progress at that moment, without invented finish times. A fourth-place player stands beside the podium. Time Trial celebrates the current run against saved matching times. Next Track, Race Again and Main Menu remain visible without scrolling.

## Build

Run `npm ci`, `npm run check`, and `npm run build`. The build creates identical standalone HTML files in `dist/`. GitHub Pages serves the static release files at the repository root. For a release, copy `dist/index.html`, `dist/Voxel-Bikes-Offline.html`, and `dist/.nojekyll` to the root, then commit them with the source.
