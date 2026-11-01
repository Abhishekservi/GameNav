# GameNav

Game-inspired city map for iPhone, built with Expo SDK 58, React Native 0.88, TypeScript, and MapLibre React Native 11.5.1. The map starts over South Mumbai. Once a recent, accurate GPS fix is available, it follows your actual location, wherever you are.

For use away from the Mac, install the **Release** build described under **Use GameNav away from the Mac**. It embeds the app code and needs no Metro connection. Internet access is still needed for maps, search and new route requests.

## Run the app

Run commands from the repository root, which contains the map implementation. The nested `gamenav/` directory is a separate starter app and has not been modified.

```sh
npm ci
npx expo start --dev-client
```

Open GameNav's development client on your iPhone and connect to the displayed development server. The phone and computer must be able to reach each other on the network. **Expo Go cannot load MapLibre's native module.**

The existing starter app needs a new native build because Expo Router, `react-native-screens`, safe-area support, the app URL scheme, and location permission configuration have been added. After that build is installed, ordinary HUD, theme, and GPS JavaScript changes can reload through Metro.

## Build and run on your physical iPhone (Free Apple Account Workflow)

You can build, install, and run GameNav directly on a physical iPhone using a free Personal Apple Account—no paid Apple Developer Program membership required.

> [!NOTE]
> Free Personal Team provisioning profiles expire every 7 days. When the profile expires, rebuild and reinstall onto the iPhone following the steps below.

### 1. Prerequisites & Account Setup
1. Open **Xcode → Settings → Apple Accounts** and add your free Apple Account.
2. Connect your iPhone to your Mac via USB, unlock it, and tap **Trust This Computer**.
3. Enable **Developer Mode** on your iPhone under **Settings → Privacy & Security → Developer Mode** (requires device restart).
4. Verify your device UDID is recognized:
   ```sh
   xcrun devicectl list devices
   ```

### 2. Dependencies & Build Command
From the root project directory:

```sh
# 1. Install CocoaPods dependencies (generates GameNav.xcworkspace)
pod install --project-directory=ios

# 2. Resolve Swift Package dependencies (MapLibre Native distribution)
xcodebuild -workspace ios/GameNav.xcworkspace -scheme GameNav -resolvePackageDependencies

# 3. Build the native debug app with automatic provisioning updates
xcodebuild -workspace ios/GameNav.xcworkspace \
  -scheme GameNav \
  -configuration Debug \
  -destination "id=<YOUR_DEVICE_UDID>" \
  -allowProvisioningUpdates \
  -allowProvisioningDeviceRegistration
```

*(When prompted by macOS during codesign for keychain access, enter your Mac password and click **Always Allow**).*

### 3. Install & Launch on Physical iPhone
```sh
# Install built app to connected device
xcrun devicectl device install app --device <YOUR_DEVICE_UDID> \
  ~/Library/Developer/Xcode/DerivedData/GameNav-*/Build/Products/Debug-iphoneos/GameNav.app

# Start the Metro bundler
npx expo start

# Launch the app with the Metro payload URL
xcrun devicectl device process launch --device <YOUR_DEVICE_UDID> \
  --terminate-existing \
  --payload-url "exp+gamenav://?__expo_url=http://<YOUR_LOCAL_IP>:8081" \
  com.abhishekchoudhary.gamenav
```

### 4. First-Time iOS Permissions on Device
- **Trust Developer Profile**: On your iPhone, go to **Settings → General → VPN & Device Management**, tap your developer certificate under **DEVELOPER APP**, and tap **Trust**.
- **Local Network Permission**: When prompted by Expo Dev Launcher on the iPhone, tap **Allow** and tap **Done** to connect to your computer's Metro server.
- **Location Permission**: Tap **Allow While Using App** to activate live GPS tracking and vehicle marker follow mode.

## Verification & Device Acceptance Results

Physical device testing was completed on a connected **physical iPhone 14**:

1. **Native Compilation & Signing**: Compiled all 127 targets in Xcode 27.2 with Hermes engine and MapLibre Native; signed automatically under Personal Team `WJ7K33HG5V`.
2. **App Installation & Launch**: Successfully installed via `devicectl` (`bundleID: com.abhishekchoudhary.gamenav`) and launched with Expo Dev Client.
3. **Map Rendering & Vector Tiles**: OpenFreeMap vector tiles loaded cleanly over the network; roads, labels, and landcover displayed at high resolution.
4. **3D Buildings Extrusion**: Height-based polygon extrusions rendered crisply around local Mumbai coordinates.
5. **HUD & Theming**: Grayscale "GTA V" and dark "Classic" theme toggles, cyan-accented HUD, speed display, and destination search displayed with proper safe-area margins.
6. **Live GPS & Vehicle Marker**: Foreground location permissions granted; live GPS fixes received; position interpolated between updates with real course/compass heading. GTA V now uses an original white direction arrow; Classic keeps the vehicle icon.
7. **Attribution**: Persistent attribution links for OpenFreeMap, OpenMapTiles, and OpenStreetMap remain reachable along the bottom edge.
8. **Automated Verification**:
   - `npm test`: 35/35 tests passed (GPS validation, speed conversion, compass shortest arc, MapLibre styles, and place-search validation/recovery).
   - `npx expo lint`: Clean (0 errors).
   - `npx tsc --noEmit`: Clean (0 type errors).

## Optional cloud iPhone development build (paid Apple membership)

```sh
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile development
```

Follow the EAS prompts to link your Expo project, register your iPhone, and configure Apple signing. Physical iPhone builds distributed through EAS require an Apple Developer membership and a provisioning profile that includes your phone. Open the successful build's installation link on that phone, enable Developer Mode if requested, then start Metro with the command above.

The configured bundle identifier is `com.abhishekchoudhary.gamenav`. The initial project had no identifier configured. Confirm this in `app.json` before generating signing credentials; an older installed app with a different identifier will remain a separate app.

`development-simulator` is available for an EAS simulator build. Simulator builds cannot be installed on a physical iPhone.

## What works

- Classic and GTA V vector map styles, interactive pan/zoom/rotation, and animated camera transitions. GTA V uses a grayscale pause-map treatment: near-black land, gray building footprints, pale roads with dark outlines, and sparse labels.
- Real foreground GPS location, measured speed in km/h, compass at rest, and direction of travel above 2 m/s.
- Original vehicle marker interpolated between received fixes using MapLibre 11's `LayerAnnotation`. No simulated driving or road snapping.
- Heading-up and north-up follow modes; dragging the map suspends follow; GPS recenters it. Map options → Explore Mumbai returns to the city overview.
- Default flat, north-up map. Map options → Buildings enables tilted views and building extrusions above zoom 15 from `building.render_height` and `render_min_height`, respecting `hide_3d`. Footprints without supplied heights remain flat. Zoom in to see available buildings.
- Permission recovery, service-disabled and weak-GPS states, stale-position indication, map loading timeout, native tile-error notices, and map/GPS retry controls.
- A rounded search bar, compact destination/route card, two circular map controls, Reduce Motion support, and 44-point or larger touch targets. The layers button opens Map options for themes, buildings, orientation, and Mumbai overview. Search and setup controls hide while moving; a small speed badge appears. The old SHOW HUD/FULL MAP panels are removed.

Destination search is live: select a real result, calculate a real road route, then tap **Start journey** while stopped. A compact banner shows the next OSRM maneuver and GPS-based distance to it. There is **no live traffic, live arrival ETA, speed-limit detection, spoken guidance, automatic rerouting, background tracking, or offline map download**. GPS speed is informational. Keep eyes on the road and use a passenger for setup.

## Map provider and attribution

The default provider is [OpenFreeMap](https://openfreemap.org/quick_start/), a legitimate service that supports MapLibre Native. No API key is required. No MapLibre demonstration tiles are used. Live vector tiles and label glyphs require internet access; there is no guaranteed offline coverage.

To change providers, copy `.env.example` to `.env.local`, configure the endpoint, glyph URL, and required attribution, and restart Metro. The provider must expose **OpenMapTiles-compatible TileJSON**, including the `transportation`, `transportation_name`, `place`, `building`, `water`, `landcover`, and `landuse` layers. A provider with another schema needs corresponding edits in `src/maps/style.ts`. `EXPO_PUBLIC_*` values are included in the app bundle: use only client-safe public API keys. Set the same variables in the EAS development environment when building in the cloud.

Both themes use our own style definitions and original vehicle/direction assets. No game map textures, logos, icons, or fonts are copied. Shared builds show native attribution and the default provider's links along the bottom edge. The personal-device presentation described below hides those labels while retaining source attribution metadata and About map data. Keep attribution accessible when customizing the HUD or provider.

## Checks

```sh
npx expo lint
npx tsc --noEmit
npm test
npx expo-doctor
npx expo export --platform ios --output-dir dist/ios-check
```

The Node tests use built-in TypeScript stripping (Node 22.18+ or 24+). The 49 tests cover invalid/stale GPS fixes, unknown speeds, compass wraparound, both themes in 2D/3D, real maneuver parsing, journey progress/recovery/completion, saved-place persistence/concurrency/failure recovery, and routing/search clients: coordinate validation, deduplication, query encoding, caching/expiry, cancellation, provider errors/cooldowns, timeouts, and serialized requests. The export check verifies the Hermes JavaScript bundle and assets; it does not compile or sign the native iOS app.

## Physical iPhone acceptance checks

After installing a signed development build:

1. Allow precise location outdoors. Check that the position marker appears at your real location, speed is measured, and heading turns smoothly across north.
2. Pan and zoom; confirm follow pauses. Tap GPS; confirm the camera recenters. Toggle north-up and heading-up.
3. While stopped, open Map options to switch themes and explore Mumbai. Change Buildings to 3D for available height-based buildings above zoom 15, and Flat to restore the flat map. Confirm roads and labels remain readable.
4. Deny location, disable Precise Location, and disable Location Services. Confirm the corresponding recovery message; restore access through Settings and return to the app.
5. Disable internet and move to uncached map areas. Confirm the tile warning and retry work once online. GPS failure must not show an old speed as current.
6. Background and resume the app; confirm foreground subscriptions resume. Enable Reduce Motion and large text; check HUD spacing and animation behavior.
7. With a passenger operating the app, verify moving mode removes search/theme controls and keeps the GPS and camera controls available. Confirm all attribution links remain reachable.

## Earlier physical-device verification

The earlier map/search checkpoint completed local development, native compilation, free Apple Account signing, physical iPhone installation, and on-device runtime validation:
- **Local Xcode Build & Free Signing**: Built locally targeting iPhone 14 with personal team `WJ7K33HG5V`.
- **Physical Device Execution**: Verified on physical hardware (iPhone 14, iOS 27.0.1).
- **Live Vector Map & HUD**: Verified via live screen capture showing 3D buildings, vehicle tracking, GPS fix reception (±14 m), and theme controls.
- **Code Quality**: Lint (`expo lint`), TypeScript (`tsc --noEmit`), and 35/35 tests pass with zero errors.

At that checkpoint the dependency audit reported 9 entries (3 high, 6 low), including advisories inherited through Expo tooling. Its proposed automatic fix downgraded Expo to SDK 51, so that incompatible change was not applied. This historical count is not a current audit report.

## Pause-map styling revision

GTA V was restyled against user-provided GTA V pause-map screenshots while retaining real OpenFreeMap geometry. The revision was viewed on the physical iPhone with live GPS, grayscale roads/buildings, the white heading arrow, minimal controls, and visible attribution. This revision changes TypeScript, map style JSON, and one bundled PNG; the existing development client loads it through Metro without a native rebuild. The original installed 3D capability is available through the new 3D/2D control. Both themes validate in 2D and 3D; 19 tests, lint, and TypeScript pass. Routing remains unimplemented.

## Real destination search

Tap the **Search places or addresses** bar. Type at least three characters. Real suggestions appear after a 600 ms pause in typing; the keyboard Search action submits immediately. Outdated requests and pending timers are cancelled when the query changes, clears, closes, or pauses for movement.

Select a result to return to the map. The camera moves to the result's coordinates and an original purple pin marks the destination. The destination card offers **Get route**, **Change**, **Details**, and a close button (×) to clear it. Details includes Show destination pin before routing. Destination selection is retained for the current app session. City/country results use a wider camera zoom than individual landmarks. Selecting a destination does not automatically calculate a route or start navigation. Use Get route on the map while stopped to request a preview.

The default service is [Photon](https://photon.komoot.io/), using OpenStreetMap data. It requires no API key for modest development use. Its public host is subject to fair-use throttling and availability changes; configure a supported hosted or self-hosted Photon-compatible HTTPS endpoint before wider deployment. Set `EXPO_PUBLIC_SEARCH_URL` in `.env.local` and restart Metro to change the endpoint. Credentials marked `EXPO_PUBLIC_*` are visible in the app bundle; do not put private server keys there.

The client sends the submitted query and a fixed public Mumbai city-center bias. It does not attach device GPS coordinates. Queries/results are cached only in memory (40 queries, 10-minute TTL); requests are serialized with at least 1.5 seconds between starts, a 10-second network timeout, and explicit cooldown handling for HTTP 429. Editing/clearing the query or closing search cancels pending work, and stale responses cannot replace the latest query's results. Empty/offline/error responses produce recovery states without fabricated results. Search and selection pause while the last measured speed indicates motion. GPS is shared between the map and search rather than starting duplicate location subscriptions.

The search screen uses an Expo Router modal anchored to the map. These changes use existing native modules, so the installed development client loads them through Metro without a native rebuild.

Verification: the physical iPhone displayed live Photon results; the user confirmed that selecting a result returned to the map with its purple pin and destination card. Lint, TypeScript, all 19 tests, and the iOS Hermes export passed. Additional device checks to exercise include changing/clearing a destination, cancelling search while a request is loading, offline search/retry, and choosing a city-level result.

## Local iPhone build verification — 31 October 2026

The native Debug build succeeded in Xcode 27.2 with automatic Personal Team signing. Its signature passed `codesign --verify --deep --strict`, and the app was installed and launched on the physical iPhone 14. The GTA V map rendered with GPS LIVE and visible map attribution through the existing Metro server.

On-device verification exposed a search modal safe-area issue. A provider at the modal root now measures its own insets; the corrected header was visually checked below the iPhone notch and status bar. This spacing fix loads through Metro and requires no additional native rebuild. Lint, TypeScript, and the iOS Hermes export passed after the fix; all 19 existing tests passed during build validation.

Local ignored build output: `.expo/ios-build/Build/Products/Debug-iphoneos/GameNav.app`. Build log: `.expo/ios-build.log`. The development app still needs a reachable Metro server; routing remains unimplemented.


## Real driving-route previews

After choosing a destination, tap **Get route** while stopped with a fresh, precise GPS fix. The app sends that position and the destination to the configured OSRM-compatible car endpoint. The default is [FOSSGIS / OSRM](https://routing.openstreetmap.de/about.html), a shared public service with a maximum of one request per second, no heavy usage, and no service guarantee. The app makes explicit requests only, serializes them at 1.5-second intervals, caches up to eight routes in memory for five minutes, and honors HTTP 429 cooldowns. Configure a supported hosted or self-hosted car service before wider distribution; all EXPO_PUBLIC variables are public configuration.

A successful response draws the returned road geometry in purple, fits the camera to it, and displays distance and approximate travel duration. **Overview** shows the whole route again; **Details → Recalculate from my location** uses your current GPS position; **Change** or the close button (×) cancels pending work and removes the previous route. Results are retained only for the current session. GPS changes do not trigger network requests. Moving more than 150 meters from the requested start prompts manual recalculation when stopped. The displayed distance and duration remain the totals at calculation, not live remaining guidance or traffic-aware arrival estimates.

Road endpoints may differ from the exact GPS/destination pin. Requests limit snapping to 500 meters; the client validates returned geometry/endpoints and shows access offsets above 30 meters. Access paths are not drawn or included in the road-route estimates. Unreachable places, malformed responses, offline/timeout and busy-service errors have explicit retry/cancel states; the app never draws a fabricated straight-line route. Route requests use a 15-second timeout. Search still sends only its fixed city bias; precise GPS is sent to the routing provider only when a route is requested.

Routing attribution appears alongside the existing map credits. Details includes provider information and an OpenStreetMap **Report a map issue** link. Route setup controls hide while moving. This feature is a route preview, with no turn prompts, voice guidance, off-route detection, background navigation, or automatic rerouting.

Validation includes 12 routing tests (31 total): route geometry/bounds, units, invalid/no-route responses, road snapping, coordinate/config validation, caching/expiry, cancellation, timeouts, cooldowns and request spacing. A real public Mumbai request returned 129 geometry points over 4,099 meters; its response passed the same parser used by the app. Physical-device confirmation is recorded separately from these automated/client checks.

## Use GameNav away from the Mac

Build a **Release** configuration to embed the JavaScript and assets instead of downloading them from Metro:

```sh
npm run build:ios:standalone
```

Select the connected physical iPhone and use the existing free Personal Team signing. This replaces the development app with the same bundle identifier. The app opens directly from its icon without the development launcher or a running Mac. Changes made later require rebuilding and reinstalling this Release app.

For the direct Xcode workflow used in this repository:

```sh
xcodebuild -workspace ios/GameNav.xcworkspace -scheme GameNav \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath .expo/ios-build \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device <YOUR_DEVICE_UDID> \
  .expo/ios-build/Build/Products/Release-iphoneos/GameNav.app
xcrun devicectl device process launch --device <YOUR_DEVICE_UDID> \
  com.abhishekchoudhary.gamenav
```

This removes the Mac/Metro requirement, **not the internet requirement**: maps, place search, and new routes use network services over Wi-Fi or cellular. GPS works on the phone, but offline maps and offline routing are not implemented. [Apple Personal Team profiles expire seven days after issuance](https://developer.apple.com/help/account/basics/about-your-developer-account); reconnect to Xcode and rebuild/reinstall when signing expires. The installed profile's actual expiry may be sooner than seven days from the latest rebuild if Xcode reuses a profile. TestFlight or App Store distribution needs paid Apple Developer Program membership; no enrollment or purchase is part of this workflow.

Standalone verification: the Release build succeeded and passed strict/deep code-signature verification. The installed app contains a 2.6 MB embedded Hermes bundle. Metro was stopped, port 8081 was confirmed closed, and the app was launched without a development URL on the physical iPhone 14. The map, original position marker, GPS LIVE status, and attribution were visually confirmed. The installed profile expires on 7 November 2026 at 01:28 AM India time. This verifies independence from Metro; internet services and free-signing expiry still apply.

The physical iPhone also displayed a real purple driving route to the selected destination with distance, estimated duration, road-access offsets, and OSRM attribution. The user confirmed the route and estimates. This was checked in the standalone Release app with Metro stopped. The initial route card was too large; interface simplification is the next revision.


## Simplified map interface

The initial game HUD was replaced with a familiar Maps-style layout while preserving the original grayscale GTA V map theme. The map has a rounded search bar, circular location/layers controls, and a compact rounded destination card. Successful routes show approximate duration and distance, with **Overview**, **Change**, and **Details** actions. Close (×) clears the selection. The address, access offsets, provider/privacy explanation, report link, and recalculation action live under **Details**. Routing attribution remains visible with the map credits, including while moving.

Map options replaces the destination card temporarily rather than stacking more panels on top. It contains Classic/GTA V themes, Flat/3D buildings, North up/Heading up, and Explore Mumbai. While moving, setup controls hide and measured speed uses a small badge. Actual rendered bottom-panel height feeds camera padding; route overview adjusts when details expand, while manual panning suspends this behavior. No Google or Apple assets are used and no turn-guidance Start action is presented.

The simplified Release app was rebuilt, passed strict/deep signature verification, and was installed on the physical iPhone with Metro still stopped. The new search bar, circular controls, original position arrow, and map attribution were visually checked. Lint, TypeScript and all 31 tests passed. The routing flow had already been verified in the preceding standalone build; the compact route card and expanded Details panel are additional manual device checks to exercise in this revision.


## Minimal typeahead search and personal-device presentation

Search now shows one input row with Cancel and a compact results list, with no title, instruction paragraphs, sample landmarks, result counts, standalone Search button, routing explanations, or search-provider footer. Names and address summaries each use one line. Three or more characters trigger suggestions after 600 ms without pressing Search; explicit submit cancels the scheduled request to prevent a duplicate. In-flight and queued stale work is cancelled. The client retains memory caching, 1.5-second request spacing, timeout and HTTP 429 recovery. Photon explicitly supports typeahead; its public service remains appropriate only for modest use.

The fixed public Mumbai bias uses zoom 10 and location_bias_scale 0.2, without uploading phone GPS. The client asks for 12 candidates and shows at most eight, grouping nearby identically named/addressed station platforms within 250 meters while retaining distant places with the same labels. No completion text or places are fabricated. Search quality remains limited by the provider's OpenStreetMap coverage.

For this private, personal-device installation, ignored `.env.local` sets `EXPO_PUBLIC_PERSONAL_BUILD=1`. It hides the visible map/provider credit labels and the native information ornament, and removes the extra bottom spacing. Licence/source information is retained under **Map options → About map data**; routing service information and the map-report link remain in route Details. The search screen has no credit footer. `.env.example` defaults the personal flag to 0, so public/shared builds retain visible map and route credits. Review provider terms and attribution before distributing the app; personal use should not be assumed to waive a hosting service's separate conditions.

The official OpenStreetMap attribution guideline distinguishes public and internal use: https://osmfoundation.org/wiki/Licence/Attribution_Guidelines. Provider terms remain separate. This presentation change does not remove source metadata or change tile/search/routing endpoints.

The 35 tests include new burst-typing debounce, clearing/closing cancellation, immediate submit without a delayed duplicate, and station-platform grouping checks, in addition to GPS, style, search client, and driving-route tests.

The personal Release build was rebuilt, passed strict/deep signing verification, installed and launched on the physical iPhone with Metro stopped. The map was visually checked with no provider credit strip or native attribution ornament. A live Bandra search reached Photon successfully; automatic on-device suggestion timing and selection remain manual checks in this revision. Lint, TypeScript and all 35 tests pass. Apple/Google traffic options have been researched only; the installed app still uses OSRM without live traffic.

## Foreground journeys and on-screen maneuvers — 1 November 2026

Earlier sections record historical build checkpoints. This revision adds **Get route → Start journey → End journey**. OSRM requests now include `steps=true`; maneuver geometry, continuity, endpoints and distances are validated before a route is accepted. No turn directions are inferred from decorative geometry. A live public Mumbai route passed this parser with 19 steps and 4,099 meters of road geometry.

Start requires a fresh GPS fix with accuracy of 35 meters or better, a stopped vehicle, and a route calculated within five minutes whose requested origin remains within 150 meters. Otherwise wait for GPS or use **Recalculate**. Starting enables heading-up follow and replaces search/options with a compact next-maneuver banner and journey card. The banner handles turns, U-turns, ramps, forks and numbered roundabout exits. Approximate remaining road distance is updated from accepted GPS projections; the preview duration is not presented as a live ETA. Dragging pauses camera follow; the GPS button recenters. **End journey** remains accessible while moving and returns to the preview.

Weak/stale GPS, a position away from the route, opposite travel direction, ambiguous overlapping road geometry or implausible progress suspend turn prompts and remaining distance. Recovery can resume on the original route; **Recalculate** is manual and available when stopped. There is no automatic network request from GPS movement. These are conservative local geometry checks, not a full road-network map-matching service. Building entrances and access paths between a snapped road endpoint and the destination pin remain outside the driving route.

Completion requires three distinct precise, stopped GPS fixes near the road endpoint. The app says **Driving route complete**, and identifies a remaining gap to the destination pin when applicable. It does not guarantee arrival at a building entrance. `expo-keep-awake` keeps the display awake during an active journey and releases it when ended/completed. Adding this direct native dependency requires CocoaPods synchronization and a native rebuild; the Release build embeds all JavaScript and assets for use without Metro.

Validation: lint, TypeScript and all 43 tests pass, including start guards, maneuver formatting, advancement across a turn, weak/stale/out-of-order GPS, off-route recovery, opposite direction, implausible jumps, overlapping geometry, endpoint completion and malformed maneuver responses. Synthetic location sequences exist only in tests. Actual road testing with a passenger is still needed; automated checks do not establish production navigation reliability. Keep GameNav in the foreground with internet available for map/search/new routes. Voice, traffic, background navigation and automatic rerouting are not included.

Native validation: CocoaPods synchronization and the Xcode Release build succeeded. Strict/deep code-signature verification passed; the app contains an embedded 2.76 MB Hermes bundle. It was installed and launched on the physical iPhone 14 without a development URL, with no Metro server listening on port 8081. The grayscale vector map, position arrow and minimal controls were visually verified. The reused Personal Team profile expires **7 November 2026, 01:28 AM IST**. This confirms standalone launch, not an on-road maneuver test. Journey-screen acceptance is recorded separately below when confirmed.

Stationary physical-device acceptance: the user selected a destination, calculated a real route and started the journey. The user confirmed that the turn banner and End journey control appeared. Live device viewing also verified the maneuver/distance banner, purple road route, remaining-distance card and readable layout below the status bar. This confirms the foreground journey screen runs in the standalone Release app. Maneuver advancement while actually travelling, off-route recovery and arrival remain road-test checks; no driving was simulated in the installed app.

## Tilted journey view and mission places

**Start journey** now changes the browsing camera to a closer zoom (17.2), a 55-degree tilt, and heading-up follow. The position marker is lower in the unobscured viewport to leave more road visible ahead. Available height-based buildings are enabled in this view. **Overview** shows the flat route; the GPS control restores the navigation perspective. Dragging suspends follow, and End journey restores the browsing view. Reduce Motion removes transition animation. This changes the camera and presentation; the underlying route and guidance limitations described above still apply.

Search has **H Home**, **W Work**, and **S Shop** shortcuts directly below the input. Tap an empty shortcut, then select a search result or choose **Use my location** with accurate GPS. Alternatively, select a destination or hold the map to drop an exact pin, tap **☆** on its card, and choose Home, Work or Shop. No place or address is fabricated for a dropped pin. Existing assignments can be replaced with confirmation. Hold a search shortcut to change/remove it, or use the saved letter button on the destination card to manage it.

Saved places appear as original colored letter badges on the map, with 44-point source hitboxes. Tap a badge or search shortcut to select its destination, then **Directions → Start journey**. Tapping a shortcut alone does not send a routing request. Unrelated mission badges are hidden during journeys, and setup actions are disabled while moving.

The three assignments are persisted in the app's document directory through the current Expo SDK 58 `expo-file-system` File/Paths API. Writes are serialized, staged before replacement, and retain a validated previous version for interrupted-write recovery. Failed writes show an error and do not report a successful save. Saved-place files are not uploaded by this feature and are not committed to the repository. Normal device backup behavior may apply. They survive app restarts and in-place app updates; uninstalling the app removes its data. There is no account synchronization.

Adding `expo-file-system` as a direct SDK-compatible dependency requires CocoaPods synchronization and rebuilding the standalone app. Lint, TypeScript and all 49 tests pass. The six saved-place tests exercise relaunch persistence, removal, concurrent hydration/saves, failed-write recovery, malformed data protection, coordinate validation and snapshot isolation. Physical camera/shortcut/persistence acceptance for this revision is recorded below after installation.

Native checkpoint: CocoaPods and the Release build succeeded with zero build errors, strict/deep signing verification passed, and the embedded Hermes bundle includes the saved-place feature (2.84 MB). The app was installed and launched on the physical iPhone 14 with Metro still stopped. The Home/Work/Shop shortcut row was visually verified below the search input, clear of the status bar. The reused signing profile still expires 7 November 2026 at 01:28 AM IST. Saved-place and camera acceptance are separate from this launch check.

Physical-device acceptance: the user confirmed the shortcuts, saving and tilted journey view work. The map's saved Home/Work letter badges and saved-place destination card were visually checked. GameNav was then terminated and relaunched without Metro; the saved Home marker reappeared from persisted data, verifying retention across a real process restart. The navigation tilt confirmation is user-reported; moving-road camera behavior, marker taps, pin saving and editing/removal remain additional manual checks. No private saved-place coordinates or screenshots were added to the repository.
