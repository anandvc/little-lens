# Little Lens

[Live app](https://little-lens-visual-skills.shikha.chatgpt.site/) · [MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

A free visual skills workspace for individuals and families. Profiles accept any nonnegative whole-number age. Activities were originally designed for ages 8–12 and are not age-normed or clinically validated for any age. Adults can work independently; children should have adult help. It includes local family profiles, descriptive symptom check-ins, the original six-round visual search / memory / spatial matching tasks, five expanded activities, adjustable practice, printable worksheets, longitudinal task results, and JSON backup/import.

## Clinical boundary

These original tasks and questions are not clinically validated. Results describe task performance, not diagnoses, age norms, or treatment outcomes. Practice has no established clinical remediation benefit. The Evidence view cites NEI, CITT, AAPOS, and NHS sources and distinguishes clinical treatment research from these activities. Content was reviewed against those sources on September 13, 2026; this is not an independent clinical validation.

## Run

Use Node 22.18+ (native TypeScript stripping is used for tests).

- `npm ci`
- `npm run dev`
- `npm test`
- `npx tsc --noEmit`
- `npm run build`

The application is React / TypeScript on the Sites Vinext starter. `app/page.tsx` contains the family workspace and activity runner; `lib/vision.ts` defines original-task validation and IndexedDB persistence; `lib/extended.ts` implements deterministic expanded-task generation and per-trial validation, while `components/lens/expanded.tsx` supplies their library, runner, printouts, and reports.

## Data and privacy

All profile data is stored in IndexedDB (`little-lens`, store `family`). There is no personal-data API, app analytics, or remote AI processing. Exports contain unencrypted personal information; users control their storage and deletion. Import replaces local data only after validation and explicit confirmation. The app supports multiple profiles in one browser. Writes use an optimistic transaction check so a stale tab cannot overwrite newer data; a conflict asks the user to export and reload. Clearing browser storage can erase records.

Version 2 exports contain profiles, symptom check-ins, original attempts, and expanded sessions. Version 1 backups and existing browser records migrate in memory without altering their original records. The IndexedDB database upgrades to version 2 without recreating its store, preventing an old version-1 app tab from overwriting new-format records. Every attempt has a task version, mode, difficulty, input method, completion state, counts, and elapsed seconds. Incomplete attempts are persisted before activities begin, so reloads cannot manufacture completed results. Assessments compare only matching profile, task, version, difficulty, and a single input method. Practice and mixed-input sessions do not enter comparisons.

## Verification

Automated domain tests cover generation across all tasks and levels, unique correct answers, scoring, comparison eligibility, versioned backup integrity, and symptom guidance priority. Browser checks cover profile creation and separation, symptom entry, all three task flows, keyboard/touch input, persistence, interruption, printable worksheets and family reports, malformed backup handling, backup restoration, deletion, responsive layouts, and network requests. Test fixtures are isolated in ignored local directories and never shipped.

## Hosting and contributions

This repository publishes the source, not a GitHub Pages deployment. The live app remains on ChatGPT Sites. The current build produces a Cloudflare-compatible Worker; GitHub Pages would need a static build and asset-path changes.

The public checkout's `.openai/hosting.json` has empty resource bindings and no live-site publishing identity. Local development needs no Sites account or API key. Camera access requires localhost or HTTPS; models and WASM are served locally from `public/vision`. Use JSON backup/import to move histories between website addresses.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development and reporting guidelines. Original Little Lens code is MIT licensed; bundled third-party code, models and assets retain their respective licenses in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Expanded activities

All original activities, reports, check-ins, and worksheets remain available. The additions are:

- Detail detective: match shape, direction, and fill among distractors, with varying size and density.
- Turn it around: mentally rotate a pattern by 90°, 180°, or 270°.
- Remember the route: reproduce 3–5 sequentially highlighted positions.
- Pattern builder: reconstruct a reference on a 3×3 or 4×4 grid.
- Block studio: rotate and place four tiles to reproduce a 4×4 target; accept all visually equivalent solutions.

Expanded assessments use 12 rounds at fixed level 2; practice uses 6 rounds at the selected level. Each completed round is saved before continuing. Every fourth round offers a break. Tab hiding or resizing during the task ends it as incomplete, and a reload preserves already-saved rounds. Trials record seed, expected and chosen response, correctness, elapsed time, and input method. Import validation regenerates stimuli to verify trial consistency.

Expanded comparisons require matching task version, total, level, single input method, viewport, and pixel ratio. They never mix with original six-round assessments. Reports expose every round and separate time from accuracy. Every new activity also has a printable version with a parent answer key. All content remains original and unvalidated as a clinical assessment or treatment.

## Comprehensive exploratory suite (September 22, 2026)

The app now includes 21 additional modules (29 total with the existing eight): seven performance tasks; six visual-function observation flows; five experimental webcam tasks; and three helper-assisted observation forms. They are not validated diagnostic instruments. Original stimuli do not reproduce proprietary clinical tests. Each module carries its own source, instructions and limitations.

New `lib/suite.ts` records use backup schema 3. Versions 1 and 2 migrate without changing their profiles or session records. IndexedDB upgrades to version 3, preserving the `family` store and preventing older app tabs from overwriting new records. New sessions are created incomplete, saved between rounds, and excluded from comparisons when interrupted or unusable. Only performance sessions with identical task versions and recorded conditions/input are compared. Camera and assisted observations are descriptive and not scored against clinical cutoffs.

Screen symbol checks require physical ruler calibration, measured viewing distance, one eye at a time, correction notes, and display resolution limits. Sizes are angular symbol sizes, not a clinical acuity result. Contrast and colour tasks report digital stimulus conditions rather than calibrated clinical sensitivity or colour deficiency. Central-grid and helper-assisted entries are observations only.

### Webcam processing

`public/vision` contains a pinned MediaPipe Tasks Vision 0.10.32 runtime and Face Landmarker float16 v1 model. All assets are served from the same site. A classic web worker dynamically imports the module and performs CPU inference; the main UI stays responsive. No video/audio is recorded or uploaded. The camera requires explicit consent and browser permission. Streams terminate on stop, close, navigation, tab hiding, or viewport change. Closing while permission is pending also discards any subsequently granted stream.

Nine-point calibration is followed by five different validation targets. A final independent check follows each 24-second task. The original ridge-regression gaze estimator uses iris-relative features and head-position features. Unusable sessions are labelled as measurement failures, never eye disorders. Engineering gates: at least 25 validation samples, mean normalized surface error <=0.12, >=75% usable frames, and >=10 observed frames/sec. A run also needs >=10 usable frames/sec. Gross head position/scale/roll departures reject frames. These thresholds have no clinical validation and do not justify diagnostic claims. Raw frames, landmarks, fitted calibration and gaze series are discarded; only aggregate metrics are stored. Surface-coordinate distances are not degrees of visual angle or milliseconds of saccade latency. Reading-region estimates do not identify words or dyslexia.

Real-person calibration accuracy across cameras, glasses, ages and lighting remains unvalidated. Automated tests of model loading, blank/no-face input, permission refusal, stop cleanup and synthetic gaze mathematics cannot substitute for clinical or device validation.

Helper-assisted observations also offer a separate opt-in, silent recording control. The browser MediaRecorder output lives only in temporary memory, stops after 60 seconds or when hidden, and is discarded when the activity closes unless explicitly downloaded. It is not stored in IndexedDB or backups. The file can be manually shared with a clinician by the user; the app has no sharing/upload endpoint.

Screen symbol sets intentionally use larger angular sizes that consumer displays can resolve. They report direction-response performance across those sizes, without converting to a Snellen/clinical acuity score. Calibration values and correction/eye/distance are retained for context. No assumption that a correct score rules out reduced acuity is made.

## Camera protocol 2

New camera attempts use task version 2; earlier version-1 records remain readable and unchanged. The backup format stays at schema 3. Camera results continue to be descriptive and excluded from automated progress comparisons.

- The target surface has a fixed position and size across calibration, instructions, task and validation. Frame processing checks its actual bounding rectangle; a change interrupts the session.
- Video frames use `requestVideoFrameCallback` where available. The frame's capture timestamp is used when exposed, otherwise its presentation/callback timestamp is recorded with the limitation. Moving-target positions are animated separately from inference and matched to a timestamped display history. Processing delay is not reported as physiological response latency.
- Automatic capture checks request 480p, 720p and 1080p, record the actual resolution, processed frame rate, inference duration and approximate eye width in source pixels. Among modes processing at least 20 fps, prefer more eye detail, then resolution; otherwise prefer the fastest. This is a capture/speed benchmark, not proof of gaze improvement. Fixed-resolution choices allow individual comparisons.
- Nine calibration targets wait for a stable sample window (at least 12 samples across 650 ms after a 700 ms settling period), with robust outlier rejection. A timeout offers a retry of unfinished points. These are sampling heuristics, not fixation diagnoses.
- Three regularized mappings are compared: v1-style linear features, enriched pose/iris features, and quadratic eye terms. Leave-one-target-out cross-validation holds out whole calibration targets. Equal target weighting avoids counting adjacent frames as independent training examples. A richer mapping must reduce cross-validation error by at least 10% to replace the linear baseline. This margin is an engineering selection rule.
- Five separate validation targets are never used to train or select a model. Retry validation uses different coordinates. Failures offer recapture of the three least predictable calibration points or a complete recalibration. A final fresh-target check follows the 24-second task. The existing 12% mean-error threshold is retained, with additional requirements for every target to have samples and no target to exceed 20%. Existing coverage and frame-rate requirements remain.
- Results retain per-target errors, pixel error, horizontal/vertical bias, jitter, 95th-percentile error, drift, model-selection errors, actual capture checks, and timing-source information. They explicitly distinguish eye visibility from gaze accuracy.
- Optional MediaPipe landmark smoothing uses a single-face tracker and a separate two-face guard every ten frames. It is off by default because smoothing may alter temporal measurements. Its setting is recorded; no claim of improved accuracy is made.
- After failed validation the camera stays on for an explicit retry, visibly labelled, with a one-minute idle shutdown. Stop, close, hiding the tab, and active-task geometry changes terminate camera use. Temporary calibration remains only while the activity is open; exports contain summary metrics, not images or feature vectors.

This implementation benchmarks lightweight local mappings. It does not bundle L2CS-Net or claim a pretrained image-based gaze model has been validated in this browser. Such a model remains a separate candidate requiring conversion, performance and real-user evaluation. The higher-resolution experiment preserves input detail but does not add a separate eye-crop neural model.

Research references: [Google Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js), [MPIIGaze](https://arxiv.org/abs/1711.09017), [FAZE](https://openaccess.thecvf.com/content_ICCV_2019/html/Park_Few-Shot_Adaptive_Gaze_Estimation_ICCV_2019_paper.html), [frame timing](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback). Research motivates experiments; published benchmark accuracy is not attributed to this app.

## Camera protocol 3: investigating post-task drift

An investigation found that the protocol-2 mapping could use head position as a shortcut for calibration targets. A controlled fixture with identical eye signals and a 0.048 change in normalized nose position produced approximately 53.3% vertical prediction bias in the previous mapping while passing the previous 0.07 translation guard. This is a reproduced software failure mode; it does not establish the cause of an individual real-world attempt. The original tests used a constant synthetic head position and did not expose this confounding.

Protocol 3 therefore fits only eye-relative coordinates (linear or quadratic). Head translation, face size, rotation and iris diameter cannot enter gaze predictions. A single head-position reference is established at the first accepted calibration point and retained across partial retries. It is reset only for a full calibration. A partial retry after a surface-geometry change becomes a full calibration. Tighter pose bounds apply during calibration and assessment; they remain unvalidated setup heuristics, not clinical cutoffs.

The end of the 24-second task now pauses at an explicit final-check instruction. The user initiates the final check, which repeats the same five independent locations as the passing initial validation. Neither validation is used for fitting. The 12% average and 20% worst-target error gates remain unchanged. Task and final-check start controls require the tracked position to match the calibration reference.

Failed final checks now save the initial validation, the final validation, signed drift when both checks have samples at every point, per-target sample counts, and separate eye-visibility/pose-rejection/head-shift summaries for each phase. Missing samples are not presented as zero error. Failure wording does not claim a confirmed cause or assume that camera accuracy changed. No raw images or calibration samples are exported. Earlier protocol-1 and protocol-2 records remain unchanged and readable.

Verification includes the synthetic head-confound regression, normal small pose variation and rejection bounds, preservation of initial metrics on final failure, three-protocol backup roundtrips, and full browser success and retry–task–final-failure flows. The browser geometry was checked at 1456×803 with a 1066×533 target surface. Synthetic checks establish software behaviour, not real-person gaze accuracy.

### Camera protocol 4: settling time
Stationary targets discard the first 1,000 ms. Calibration still waits for steady samples; initial and final accuracy checks then sample for 1,800 ms. Pursuit retains its 24-second trajectory and excludes the first second of each 12-second direction segment from target-error scoring. Timings are fixed across attempts and recorded in history; error thresholds are unchanged. Protocols 1–3 remain importable. These engineering timings are not clinically validated norms.

### Camera protocol 5: requested accuracy tolerance
The average validation error limit is now 20% of normalized surface units (previously 12%). Each target still must have error at most 20%. Sample-count, coverage, speed, pose and timing requirements remain unchanged. Both initial and final validation use this limit, saved explicitly with new results. Older camera records are preserved without reclassification.

### Optional camera protocol 6: paired comparison
Open a camera activity and choose **Compare tracking methods**. Standard protocol 5 remains available. Protocol 6 compares the existing landmark mapping and an adapted BlazeGaze pretrained CNN on the same accepted captured frames, with one shared MediaPipe pass. It uses self-hosted weights and TensorFlow.js WASM; neither clickstream calibration nor remote inference is used. See `lib/vendor/webeyetrack/README.md` for exact upstream revision, MIT license, preprocessing and differences from the paper. This is a pretrained eye-image model plus a local mapping, **not a replication of neural few-shot fine-tuning or published accuracy**.

Protocol: visit nine calibration positions twice in different deterministic orders; collect one extra visit where predicted visit disagreement exceeds 8% of normalized surface units. Fit both mappings using equally weighted locations, with holdout selection excluding the entire location. Choose the tracker on five selection targets, then check it on a different five-target set without fitting to those observations. Both methods' errors, samples and paired processing rate are retained. No clinical norms; 8%, 20%, and region requirements are engineering choices.

If independent verification fails, one optional offset-fit round uses five separate targets. Fit a median translation only when all targets have enough samples and residual offsets agree within 10% (magnitude at most 20%). Apply it only after fresh independent observations show at least 20% relative improvement in average error, no worse maximum location error, and all 20% average/per-target, sample, speed and coverage requirements pass. The offset is frozen before the activity. It never retroactively repairs a completed activity. A failed final check offers one unchanged-model confirmation: even if that passes, the record remains unusable and retains both results.

Reading-region exploration adds six probes (two per row) before and after reading: at least 80% correct region overall and 70% for every row, with samples at every probe. These probes establish only coarse region separability under that setup. Normalized percent errors are not angular degrees or percent correct. All camera histories remain excluded from automated clinical/performance comparisons.

Verification: automated repeated-visit, correction holdout, region gate, exact-failure, and v1–v6 backup tests; real browser model initialization and forward pass through original weights; real landmark/crop/model processing using a public upstream test portrait (not shipped); simulated end-to-end task flows. These checks establish implementation operation, not real-person gaze accuracy or diagnostic validity.

### Camera comparison protocol 7: optional optimization and midpoint checks
Protocol 7 offers the verified offset experiment after a passing initial check as well as a failure. Users can skip it after a pass. A proposed correction still requires a consistent five-target fit and at least 20% independent relative improvement without worsening the worst location; all original sampling and error gates apply. When the correction is unhelpful or cannot be fitted, the original mapping is retained only if it passes the fresh verification observations. An earlier initial pass never substitutes for that fresh check. Accepted offsets remain frozen for the entire activity.

The 24-second activity is split into two 12-second blocks. Between them, an explicitly started five-point check uses the same verification positions and frozen mapping (1 s settling + 1.8 s sampling per point). Failure stops the session as unusable before block 2; restarting requires a new calibration/session. Midpoint samples and waiting time are excluded from task measurements. Both blocks continue the original target timeline, with pursuit settling excluded at each block start. Final checks, reading-region checks and unchanged-model confirmation remain required as before.

Records retain initial pass status, correction attempted/fit/acceptance, raw and corrected checks, midpoint checks and completed block count. Versions 1–6 remain importable unchanged. No claim of real-person accuracy improvement follows from the automated or simulated checks.

### Camera protocol 8: BlazeGaze default
All camera activities open directly with BlazeGaze + local mapping. Calibration fits only the BlazeGaze mapping; repeat disagreements are evaluated only for that mapping. Independent verification follows calibration directly, without a tracker selection round. Head-position guidance, verified offset correction, midpoint checks, reading-region checks and final validation are retained. No multi-pose calibration was added. The legacy protocol 5 tracker is available only through Advanced / compatibility, with an explicit return to BlazeGaze. Switching methods gives a fresh record ID. Protocols 1–7 remain importable unchanged.

### Logging revision 2 (protocol 8)
New BlazeGaze logs distinguish processed frames/sec from accepted frames/sec. Phase, target and task-block counters classify each processed frame once, by the first failed check: no face, multiple faces, unavailable eyes/features, head-position rejection, or unavailable gaze prediction. Counts include settling time, so accepted frame counts exceed scored validation samples. Activity-block counters are retained even when a later check fails. Frame counters cannot establish the physical cause of a detector failure.

Accuracy summaries now average pixel error, signed bias and jitter over measured targets only, consistently with normalized error. Logs include expected, measured and sufficiently sampled target counts, and retain zero sample counts for every missing point. The results table labels partial checks as incomplete. Unmeasured points are never treated as accurate; acceptance thresholds are unchanged. Previously saved logs are preserved, not reinterpreted.
