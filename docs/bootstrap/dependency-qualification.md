# Bootstrap dependency qualification

Step 1 was completed on 18 November 2026. The [candidate manifests](candidate-manifests.json) contain exact direct dependency and generator versions for the root, web, server, and mobile foundations. A temporary pnpm workspace verified those selections on the development Mac. They are inputs for [Step 2](../bootstrap-plan.md#step-2-generate-the-workspace-and-quality-commands), where the repository receives its generated apps and lockfile.

## Development Mac inventory

| Area | Installed | Verification |
|---|---|---|
| Host | Apple silicon `arm64`, macOS 27.2.1, 15 logical CPUs, 48 GiB RAM. Git 2.56.1 and Visual Studio Code 1.146.0. | Both phone profiles use ARM64. |
| JavaScript | Node 24.22.3 via mise, npm 11.19.1, Corepack 0.36.0, pnpm 12.21.0, and Watchman 2026.10.26.00. | The pnpm shim worked in a new login shell. Vite+ 1.7.0 ran through pnpm, and Watchman registered a temporary directory with the FSEvents watcher. [Corepack](https://github.com/nodejs/corepack), [Vite+ local CLI](https://viteplus.dev/guide/local-cli), [Watchman](https://formulae.brew.sh/formula/watchman). |
| Containers | Colima 0.10.3 with Docker Engine 29.5.2 on ARM64, Docker client 29.10.0, and Compose 5.7.2. | The existing Colima profile started, and Docker Compose pulled and ran the ARM64 `hello-world` image. The test container and network were removed. [Colima](https://github.com/abiosoft/colima#usage), [Docker Compose CLI](https://docs.docker.com/reference/cli/docker/compose/). |
| iOS | Xcode 27.2 (27B52), iOS 27.2 Simulator, and CocoaPods 1.17.0. | Xcode passed its first-launch check and compiled an ARM64 UIKit object. The iPhone 17 Simulator booted and ran a process. CocoaPods detected full Xcode. [Expo SDK 58 platform matrix](https://docs.expo.dev/versions/v58.0.0/#support-for-android-and-ios-versions), [Apple component CLI](https://developer.apple.com/documentation/xcode/downloading-and-installing-additional-xcode-components). |
| Android | Android Studio 2026.2, Android SDK Platform 37.0, Platform-Tools 37.0.1, Emulator 37.2.13, Build-Tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1, and ARM64 OpenJDK 17.0.21.1. | ADB confirmed the Medium Phone API 37.0 emulator finished booting with the ARM64 Google Play image. Gradle 9.4.1 ran under JDK 17. Java and D8 compiled against the Android SDK, and CMake and the NDK built an ARM64 shared library. The Expo candidate compiles against API 37 and targets API 36. [React Native 0.88.1 Android catalog](https://github.com/facebook/react-native/blob/v0.88.1/packages/react-native/gradle/libs.versions.toml), [Android Gradle Plugin 9.2](https://developer.android.com/build/releases/agp-9-2-0-release-notes), [Expo Android build tooling](https://github.com/expo/expo/tree/main/packages/expo-modules-autolinking/android/expo-gradle-plugin). |

## Candidate versions and evidence

| Area | Selection | Verification |
|---|---|---|
| Workspace | pnpm 12.21.0, TypeScript 6.0.3, Node 24 typings | Strict peer resolution and a frozen reinstall passed in the temporary workspace. TypeScript 6.0.3 matches the Expo 58 template and compiled all three fixtures. |
| Vite+ | Vite+ 1.7.0, core alias 8.3.8000 (Vite 8.3.8), bundled Vitest 5.1.0 | The local CLI reported these versions. A generated route tree, production web build, and bundled Vitest smoke test all passed. [Vite+ local CLI](https://viteplus.dev/guide/local-cli). |
| Web | React and React DOM 19.3.1, React plugin 6.3.0, TanStack Router 1.170.46 and Router plugin 1.169.0, Query 5.108.0, Tailwind 4.3.5 | The Router plugin ran before the React plugin. The build emitted a split route and the Tailwind utility used by the fixture. The shadcn 4.23.0 CLI was checked with `init --help`. Component generation belongs with the web scaffold. [TanStack Router Vite setup](https://tanstack.com/router/latest/docs/installation/with-vite), [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite), [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite). |
| Code quality | Biome 2.6.8 and explicit `tsc` per workspace | The Biome binary ran and `biome init` generated a config in the temporary workspace. Use a tracked root `biome.json` for supported files and let Vite+ run the tasks. Disable overlapping template formatting and lint tasks. [Biome quick start](https://biomejs.dev/guides/getting-started/), [Vite+ check configuration](https://viteplus.dev/config/check). |
| Node server | Hono 4.13.19, Node adapter 2.1.9, tsx 4.23.15 | Official Node template generated, compiled with the candidate TypeScript, and Hono served a fixture response in Node. [Hono Node setup](https://hono.dev/docs/getting-started/nodejs). |
| Mobile runtime | Expo 58.0.26, Router 58.0.32, React Native 0.88.1, React and React DOM 19.3.0, Reanimated 4.7.1, Worklets 0.13.0 | `expo install --check`, all 20 Expo Doctor checks, strict TypeScript on the trimmed fixture, and Android and iOS Metro exports passed. Keep the web and native React versions scoped to their respective renderers. [Expo SDK 58 matrix](https://docs.expo.dev/versions/v58.0.0/), [Expo monorepos](https://docs.expo.dev/guides/monorepos/). |
| Native styling | Unistyles 3.8.2, Nitro Modules 0.37.2, React Native normalize-colors 0.88.1 | Nitro clears the upstream minimum of 0.37.1. A typed Unistyles theme initialized before Router, and its Babel-transformed styles bundled in both Metro exports. Native linking and runtime theme changes are pending. [Unistyles 3.8.2 compatibility](https://github.com/jpudysz/react-native-unistyles/tree/v3.8.2#installation), [Expo Router initialization](https://www.unistyl.es/v3/guides/expo-router/). |
| Native maps | RNMapbox 10.3.18 with Maps SDK 11.33.0 on both platforms | The MapView fixture bundled. Expo prebuild emitted the Mapbox version in the Podfile and Android Gradle properties and enabled the New Architecture. SDK linking, emulator launch, and map rendering are pending. [RNMapbox 10.3.18 Expo plugin](https://github.com/rnmapbox/maps/blob/v10.3.18/plugin/install.md). |

The default Expo 58 template generated three TypeScript errors in its sample cross-platform UI. The candidate mobile fixture removes that demo and compiles a native route using Unistyles and Mapbox under strict TypeScript. Retain the matched mobile React DOM pin for Expo Router's dependency graph. Without it, the temporary workspace resolved React DOM 19.3.1 against mobile React 19.3.0 and failed strict peer resolution.

Use the isolated pnpm layout tested here. The root candidate carries the Hono template's esbuild build permission and Vite+'s exact Vite and Vitest overrides. pnpm added exact release-age exceptions for some newly published packages in the temporary install. Re-evaluate those when generating the real lockfile with normal release-age policy. The Vite+ release includes a beta `tsrs` transitively. The explicit compiler and every direct candidate use stable releases. [pnpm workspace settings](https://pnpm.io/settings), [Vite+ 1.7.0 package metadata](https://registry.npmjs.org/vite-plus/1.7.0).

## License notes

Registry checks reported MIT for the direct npm candidates, CLI generators, and explicit overrides, with four exceptions. TypeScript is Apache-2.0, Biome is MIT OR Apache-2.0, `create-expo` is BSD-3-Clause, and `expo-template-default` is 0BSD. Node.js ships a separate license file with bundled notices. Review transitive notices from the actual lockfile and native artifacts during release preparation. [Node.js 24.22.3 license](https://github.com/nodejs/node/blob/v24.22.3/LICENSE).

RNMapbox's MIT license applies to the bridge. Mapbox's SDK and service terms govern the native SDK and map content, including attribution and telemetry opt-out. The pinned Android release guide uses a Maven repository without a download secret. A public Mapbox token is needed to test live map rendering. Mapbox plans to stop publishing new iOS SDKs on CocoaPods after December 2026, so qualify the bridge's Swift Package Manager option when testing updates. [RNMapbox Android install](https://github.com/rnmapbox/maps/blob/v10.3.18/android/install.md), [Mapbox attribution](https://docs.mapbox.com/help/dive-deeper/attribution/), [Mapbox iOS SDK installation](https://docs.mapbox.com/ios/maps/guides/install/).

## Environment setup checklist

- [x] Enable and verify pnpm 12.21.0 using `corepack install -g pnpm@12.21.0` and `corepack enable pnpm`.
- [x] Verify the pinned workspace and starter generation commands in temporary directories.
- [x] Install the shell build helpers with `brew install openjdk@17 cocoapods watchman`. On this Mac, `~/.zprofile` sets `DEVELOPER_DIR` to full Xcode and adds `JAVA_HOME`, `ANDROID_HOME`, and the Android tools to new login shells. [Homebrew OpenJDK 17](https://formulae.brew.sh/formula/openjdk@17), [CocoaPods](https://formulae.brew.sh/formula/cocoapods).
- [x] Keep the existing iOS Simulator runtime and Android ARM64 emulator. Add the missing Android build components with `android sdk install build-tools/37.0.0 ndk/27.1.12297006 cmake/3.22.1`. The existing Android platform package ID is `platforms/android-37.0`. [Android SDK install](https://developer.android.com/tools/agents/android-cli/commands/sdk_install).
- [x] Start the existing Colima profile and verify Docker Engine and Compose. Use `colima start` to restart the VM when needed.
- [x] Adopt the qualified manifests with one root lockfile and Biome configuration. Verify a fresh frozen install.
- [x] Build with the Expo CLI and exercise Unistyles and the native Mapbox bridge on the iPhone 17 simulator and Android API 37 emulator. [Expo local builds](https://docs.expo.dev/guides/local-app-development/).
- [x] Qualify Better Auth 1.7.25 and its matched Expo adapter with SecureStore, verification, reset, and account switching on both development clients. [Better Auth Expo integration](https://better-auth.com/docs/integrations/expo).
- [ ] Qualify live Mapbox rendering with a scoped token during the geography workstream.
- [ ] Verify the selected Linux architecture, repositories, journal, SMTP and alert delivery on the actual VPS.

The initial Gradle distribution download timed out. The local wrapper cache now has the official Gradle 9.4.1 distribution verified against its published SHA-256 checksum. The generated wrapper ran successfully from that cache. [Gradle checksums](https://gradle.org/release-checksums/).

## Pinned starter CLI commands

| Starter | Command | Evidence |
|---|---|---|
| Workspace | `pnpm dlx --package=vite-plus@1.7.0 vp create vite:monorepo --directory <scratch-dir> --no-interactive --no-agent --no-editor --no-git --no-hooks --package-manager pnpm` | Generated and installed the stock workspace. It produced a vanilla web starter. |
| React app | `pnpm create vite@9.3.4 apps/web --template react-ts --no-interactive --no-immediate` | Generated the React starter without installing. Apply the tested Vite+ aliases and the shared TypeScript pin when integrating it. [Vite scaffolding](https://vite.dev/guide/#scaffolding-your-first-vite-project). |
| Server | `pnpm dlx create-hono@0.19.5 apps/server --template nodejs` | Generated the Node template after declining the nested install. Move its esbuild policy into the root workspace. |
| Mobile | `pnpm create expo@5.1.9 apps/mobile --template default@58.0.35 --no-install --no-agents-md` | Generated the verified Expo Router template with the exact CLI. Remove nested Git metadata and demo code when integrating it. [Expo generator](https://docs.expo.dev/more/create-expo/), [create-expo 5.1.9 metadata](https://registry.npmjs.org/create-expo/5.1.9). |

## Bootstrap review follow-up

The TypeScript 7.0.2 CLI passed a no-emit pass across the app and package configurations. The workspace stays on 6.0.3 because the pinned OpenAPI generator uses the legacy TypeScript compiler API. Its declared peer range remains TypeScript 5, and the existing TypeScript 6 exception has passed generator parity checks. Expo's installed dependency check and all 20 Expo Doctor checks passed with the SDK-aligned pins. [OpenAPI generator package](https://www.npmjs.com/package/openapi-typescript/v/7.13.0) · [Expo CLI validation](https://docs.expo.dev/more/expo-cli/)

Scoped lockfile overrides resolved the esbuild and minimatch advisories. The remaining picomatch alert affects 2.3.2 and 4.0.7 in tooling dependency paths. Upstream lists no patched release. Keep the alert open and recheck when upstream publishes a fix. [esbuild advisory](https://github.com/advisories/GHSA-67mh-4wv8-2f99) · [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) · [picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

The synthetic Linux ARM64 media drill used Sharp 0.35.5 with libvips 8.18.7, FFmpeg and ffprobe 5.1.9, libheif 1.15.1 and ExifTool 12.57. Libheif decodes the HEIC image before Sharp resizes it. The test also writes an `hvc1` MP4, checks its HEVC stream with ffprobe and decodes it with FFmpeg. Real device-source media qualification remains part of the import workstream. [Sharp installation](https://sharp.pixelplumbing.com/install/)
