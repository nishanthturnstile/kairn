# Development and validation plan

| Field | Value |
|---|---|
| Version | 1.2 |
| Date | 17 November 2026 |
| Development host | The founder's MacBook. The [Mac inventory](bootstrap/dependency-qualification.md#development-mac-inventory) records the verified hardware and toolchain. |
| Test surfaces | iPhone iOS Simulator, Android phone emulator, and responsive web. |
| Excluded | Dedicated iPadOS/tablet testing, desktop-native applications, watch and television platforms. |
| Status | Development setup and release validation specification. |

## 1. Host and setup

Develop web, backend, and native clients on the MacBook. Use the [verified Xcode and Android setup](bootstrap/dependency-qualification.md#environment-setup-checklist) and record simulator profiles alongside native build results. Choose the Expo SDK and native toolchain together when upgrading. Run one simulator at a time if host resources require it.

Use local Expo development builds for native dependencies; Expo Go is not the qualification environment for the selected map/styling modules. No EAS subscription is required. Local application/data services use a supported container runtime where available; production remains on the existing VPS. Do not assume its OS or capacity matches the MacBook.

Record the actual host architecture, installed SDKs and environment versions with each verification run. Follow [Expo iOS Simulator](https://docs.expo.dev/workflow/ios-simulator/) and [Android Emulator](https://developer.android.com/studio/run/emulator) setup guidance at installation time.

## 2. Scope of simulator evidence

| Area | Planned verification | Evidence boundary |
|---|---|---|
| Navigation and UI | iPhone Simulator and Android emulator: small/large phone layout, keyboard, back/deep links, permissions, recovery, error states, accessibility where supported. | This does not qualify iPad or every vendor's Android behaviour. |
| Capture pipeline | Feed consented synthetic/real fixture files through the actual persistence/upload code; test interruption, missing files, denied location, low storage and duplicate commands. | A simulator camera or injected location is not proof of actual camera codec, GPS accuracy, sensor timing, or power use. |
| Audio/video | Imported supported clips, playback, transcription states, source-offset citations, injected capture completion/error. | Simulator audio/video capture support varies. Mark unavailable capture tests not run rather than passing them using fixtures. |
| Offline and restore | Network interruption, process termination/relaunch, expired sessions, account changes, tombstones, backup/restore fixtures. | Real background scheduling, force-stop/OEM behaviour, thermal limits, and device transfer remain separately qualified. |
| Performance | Production web builds and release native builds on named emulator profiles; trace lists, CPU, memory, map/player lifecycle. | Host timings cannot establish battery budgets or performance on ordinary physical phones. |
| Browser participation | Desktop Chromium, Firefox, Safari and a phone-sized WebKit/Safari environment, including imported HEIF/HEVC fixtures. | Emulation cannot establish every real iPhone photo-library/iCloud-picker behaviour. Record that coverage explicitly. |

Development uses the iPhone Simulator and Android emulator. Physical-device testing is separate from this development workflow. Before advertising hardware-specific reliability, battery, camera, or background-transfer guarantees, obtain corresponding evidence on the supported phone class; otherwise do not make those guarantees and record the residual release risk. Dedicated iPad testing is outside scope. Expo documents [Simulator limitations](https://docs.expo.dev/workflow/ios-simulator/#limitations); fixture success must not be reported as physical capture success.

## 3. Distribution

The founder confirmed web and Android public release first, with iPhone implementation and simulator verification now. Native iPhone public distribution is deferred; iPhone users contribute through responsive web for R1. Apple enrollment, signing, TestFlight and App Store distribution are later delivery work, with the same domain and permission contracts.

Android signing, production-access/testing requirements, privacy declarations, and support information must be completed before Android publication. Simulator availability is not store approval. iPhone companions must have the web contribution path at web/Android launch.

## 4. Fixtures and test method

Keep a minimal solo journey, a five-person five-day representative journey (200 photos, five bounded clips, five voice notes), and a 500-item stress journey. Include missing/incorrect times, HEIF and HEVC/MOV, missing GPS, overlapping tracks, split departures, English speech with varied accents/local names/noise, unsupported-language and code-switching fallback cases, review-only sources, withdrawn material, and unsupported files. Use consented or synthetic data and preserve its provenance.

Run the full requirements acceptance scenario plus the UX budgets in [application design](application-design.md#10-experience-and-performance-acceptance). Add tests for an unresponsive companion, members-only reading, invitation return after sign-in, two independently populated duplicates, source-derived text edits, account switching, device restore, authentication rollback, and quota waits.

For web performance use a production build, cold and warm runs, and a recorded mobile profile initially set to 4 Mbps download, 1 Mbps upload, 150 ms round-trip latency, and 4× CPU slowdown. These are synthetic test settings, not a statement about all Indian networks. Run at least 20 measured repetitions for timing summaries and retain raw failures. Native measurements record Mac hardware, OS/runtime, emulator settings, build mode, and profiling overhead; compare like with like.

Usability task attempts may use previously interviewed people or representative testers. They verify task completion and clarity; no additional demand-validation study, adoption target, or paid commitment is imposed.

## 5. Capacity and recovery qualification

Use approximately 4 vCPU and 8 GB RAM as the initial server testing baseline. Scale vertically to a larger machine when needed. Detailed user-count sizing and hosting-budget planning are outside current scope. Record actual disk/network/OS and backup details when configuring the environment.

Run representative mixed-workload regression checks with imports, author edits, public story/media reads, exports and backups to verify responsiveness and resource isolation. Report ordinary and maximum-file processing separately. Monitor latency, queue age, CPU/RAM and disk headroom; sustained pressure guides a machine upgrade and concurrency retuning. Exhaustive user-capacity modelling is deferred. Protect authentication, capture sync, withdrawal and ordinary reading from heavy conversion starvation.

Before admission, reserve space for pending uploads, source objects, derivatives, scratch, exports, and backups. Display quota waits before accepting expensive work. Test recovery from a database checkpoint older than source withdrawal, membership removal, password reset, revoked session, consumed token, and deletion. Test primary object loss before and after independent backup inclusion. Restore delivery remains closed until restrictions and object integrity are verified.

Storage allocation and exact quotas are configurable deployment inputs; the product must still communicate retention and any enforced user limits. Provider usage alerts, backup checks and disk safeguards remain ordinary operations.

## 6. Evidence register

For every claimed check record: requirement ID, source revision or artifact digest, environment, fixture version, test procedure, result, date, and known limitations. Use statuses Planned, Verified, Failed, and Not run. Package metadata compatibility alone does not establish native runtime behaviour.

Record resolved dependencies, executable builds and measured results as implementation proceeds. Planned targets and unexecuted tests must remain distinguishable from verified results.

Start with [implementation progress](progress.md) for the latest milestone outcomes and open verification work. Keep runnable regression suites in `tests/` and inline synthetic fixtures in those suites where practical. Record one-time device qualification evidence before retiring its temporary app routes.
