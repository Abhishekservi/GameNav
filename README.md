# GameNav

Game-inspired city map for iPhone, built with Expo SDK 58, React Native 0.88, TypeScript, and MapLibre React Native 11.5.1. The map starts over South Mumbai. Once a recent, accurate GPS fix is available, it follows your actual location, wherever you are.

## Run the app

Run commands from `/Users/abhishekchoudhary/Documents/GameNav`, which contains the map implementation. The nested `gamenav/` directory is a separate starter app and has not been modified.

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
From the root `/Users/abhishekchoudhary/Documents/GameNav` directory:

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

Physical device testing was completed on an **iPhone 14 (iOS physical device, UDID: `00008110-00190C28119A201E`)**:

1. **Native Compilation & Signing**: Compiled all 127 targets in Xcode 27.2 with Hermes engine and MapLibre Native; signed automatically under Personal Team `WJ7K33HG5V`.
2. **App Installation & Launch**: Successfully installed via `devicectl` (`bundleID: com.abhishekchoudhary.gamenav`) and launched with Expo Dev Client.
3. **Map Rendering & Vector Tiles**: OpenFreeMap vector tiles loaded cleanly over the network; roads, labels, and landcover displayed at high resolution.
4. **3D Buildings Extrusion**: Height-based polygon extrusions rendered crisply around local Mumbai coordinates.
5. **HUD & Theming**: Cyberpunk "Arcade City" and "Classic" theme toggles, cyan-accented HUD, speed display, and search mock displayed with proper safe-area margins.
6. **Live GPS & Vehicle Marker**: Foreground location permissions granted; live GPS accuracy locked down to ±14 m; vehicle marker animated with real-time course heading and radar pulse ring.
7. **Attribution**: Persistent attribution links for OpenFreeMap, OpenMapTiles, and OpenStreetMap remain reachable along the bottom edge.
8. **Automated Verification**:
   - `npm test`: 6/6 unit tests passed (fix validation, speed conversion, compass shortest arc, MapLibre style validation).
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

- Classic and Arcade City dark vector map styles, interactive pan/zoom/rotation, and animated camera transitions.
- Real foreground GPS location, measured speed in km/h, compass at rest, and direction of travel above 2 m/s.
- Original vehicle marker interpolated between received fixes using MapLibre 11's `LayerAnnotation`. No simulated driving or road snapping.
- Heading-up and north-up follow modes; dragging the map suspends follow; GPS recenters it. The Mumbai button returns to the city overview.
- 3D extrusions above zoom 15 from `building.render_height` and `render_min_height`, respecting `hide_3d`. Footprints without supplied heights remain flat. Zoom in to see available buildings.
- Permission recovery, service-disabled and weak-GPS states, stale-position indication, map loading timeout, native tile-error notices, and map/GPS retry controls.
- Safe-area-aware HUD, Reduce Motion support, 44-point or larger touch targets, and a simplified interface while moving. Search and theme controls hide while moving; Focus Mode can also simplify the interface while stopped.

Destination search is a labeled mock. There is **no routing, ETA, traffic, speed-limit detection, turn guidance, background tracking, or offline map download**. GPS speed is informational. Keep eyes on the road and use a passenger for setup.

## Map provider and attribution

The default provider is [OpenFreeMap](https://openfreemap.org/quick_start/), a legitimate service that supports MapLibre Native. No API key is required. No MapLibre demonstration tiles are used. Live vector tiles and label glyphs require internet access; there is no guaranteed offline coverage.

To change providers, copy `.env.example` to `.env.local`, configure the endpoint, glyph URL, and required attribution, and restart Metro. The provider must expose **OpenMapTiles-compatible TileJSON**, including the `transportation`, `transportation_name`, `place`, `building`, `water`, `landcover`, and `landuse` layers. A provider with another schema needs corresponding edits in `src/maps/style.ts`. `EXPO_PUBLIC_*` values are included in the app bundle: use only client-safe public API keys. Set the same variables in the EAS development environment when building in the cloud.

Both themes use our own style definitions and an original vehicle asset. Native attribution stays enabled and reads the source's attribution. The default provider's OpenFreeMap, OpenMapTiles, and OpenStreetMap links are also visible along the bottom edge. Keep attribution accessible when customizing the HUD or provider.

## Checks

```sh
npx expo lint
npx tsc --noEmit
npm test
npx expo-doctor
npx expo export --platform ios --output-dir dist/ios-check
```

The Node tests use built-in TypeScript stripping (Node 22.18+ or 24+). They verify stale/invalid fix rejection, unknown speeds, compass wraparound, and both styles against the installed MapLibre style validator. The export check verifies the Hermes JavaScript bundle and assets; it does not compile or sign the native iOS app.

## Physical iPhone acceptance checks

After installing a signed development build:

1. Allow precise location outdoors. Check that the car appears at your real location, speed is measured, and heading turns smoothly across north.
2. Pan and zoom; confirm follow pauses. Tap GPS; confirm the camera recenters. Toggle north-up and heading-up.
3. While stopped, switch themes and explore Mumbai. Zoom in above 15 for available height-based buildings. Confirm roads and labels remain readable.
4. Deny location, disable Precise Location, and disable Location Services. Confirm the corresponding recovery message; restore access through Settings and return to the app.
5. Disable internet and move to uncached map areas. Confirm the tile warning and retry work once online. GPS failure must not show an old speed as current.
6. Background and resume the app; confirm foreground subscriptions resume. Enable Reduce Motion and large text; check HUD spacing and animation behavior.
7. With a passenger operating the app, verify moving mode removes search/theme controls and keeps the GPS and camera controls available. Confirm all attribution links remain reachable.

## Current verification status

All phases of local development, native compilation, free Apple Account signing, physical iPhone installation, and on-device runtime validation are **complete and verified**:
- **Local Xcode Build & Free Signing**: Built locally targeting iPhone 14 with personal team `WJ7K33HG5V`.
- **Physical Device Execution**: Verified on physical hardware (`00008110-00190C28119A201E`).
- **Live Vector Map & HUD**: Verified via live screen capture showing 3D buildings, vehicle tracking, GPS fix reception (±14 m), and theme controls.
- **Code Quality**: Lint (`expo lint`), TypeScript (`tsc --noEmit`), and 6/6 test suites pass with zero errors.

The dependency audit currently reports 9 entries (3 high, 6 low), including advisories inherited through Expo tooling. Its proposed automatic fix downgrades Expo to SDK 51, so that incompatible change was not applied. Review dependency advisories before production store release.
