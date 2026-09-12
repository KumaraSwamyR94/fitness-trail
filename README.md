# Fitness Trail

**Strength Training Journal & Tracker**

Fitness Trail is an offline-first iOS and Android strength-training and BMI journal built with Expo Router, React Native, TypeScript, and SQLite. It intentionally has no account, cloud API, or analytics dependency. File-based exports and manual sync keep users in control of where their data is stored.

Workout sessions support normal exercises and supersets of two or more ordered exercises. Superset rounds guide set logging in sequence, allow explicit skips that can be filled later, and resume unfinished rounds after navigation or app restarts. A superset can optionally be saved as a reusable template owned by the selected profile.

## Data export and manual sync

Open **Profiles**, find the **Data & Sync** card, and select **Open Data & Sync**. The screen remains available when the app has no profiles, so a JSON or ZIP backup can restore data into a fresh installation.

### Export data

1. Select one or more profiles.
2. Select **Workouts**, **BMI**, or both. At least one data type is required.
3. Select **All time** or **Custom**. Custom start and end dates are inclusive and use the stored local dates for sessions and BMI measurements.
4. Select **CSV Bundle** for spreadsheet use or **Fitness Trail JSON** for a lossless backup.
5. Review the selected session, exercise, set, BMI, superset, and template counts.
6. Select **Create and Share Export**, then choose a location or app from the system share sheet.

Exported files contain unencrypted personal health information. Store and share them carefully.

### Choose an export format

| Format                 | Best for                                                     | Contents and limitations                                                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **CSV Bundle**         | Excel, Numbers, Google Sheets, and editable transfers        | A single profile and data type produces one CSV file. Larger selections produce a ZIP with a manifest, checksums, and per-profile CSV files. Workout CSV preserves sessions, exercises, sets, and basic superset grouping, but not reusable templates or in-progress superset rounds. |
| **Fitness Trail JSON** | Complete backup, restore, and repeated device-to-device sync | Preserves stable IDs, timestamps, profiles, workouts, BMI history, supersets, rounds, and reusable templates. Local profile photos and the selected-profile setting are intentionally excluded.                                                                                       |

Both formats include only the profiles, data types, and date range selected for export. Workout templates are included whenever Workouts is selected because templates do not have a workout date.

### Import and sync

The importer accepts `.csv`, `.zip`, and `.json` files. A standalone CSV must be assigned to an existing profile using **Target for a standalone CSV**. JSON and ZIP files carry stable profile IDs and can create missing profiles after confirmation.

1. Select a target profile when importing a standalone CSV.
2. Select **Choose Import File** and choose a supported file.
3. Review the file type, included profiles, date coverage, and the additions, updates, unchanged records, conflicts, and invalid rows.
4. Review any notices. Invalid CSV rows and conflicts are skipped only after confirmation. Structural JSON errors and invalid archives block the entire import.
5. Select **Review and Import**, then confirm **Import Data**.

An import runs in one database transaction. It never deletes local records, replaces the database, changes existing profile photos, or overwrites records that are newer on the device. Stable IDs are used for app exports. CSV rows without IDs use their documented timestamps, names, and positions as natural keys. Reimporting the same file does not create duplicates.

The currently selected profile is preserved. When a backup creates the first profiles in an empty app, the first imported profile becomes selected. The screen refreshes profiles and shared app data after a successful import.

### CSV templates

Use the **Workouts** and **BMI** tabs under **CSV templates** to preview accepted columns, required fields, examples, units, and values. Select **Share Workout Template** or **Share BMI Template** to create a blank CSV with the exact supported headers.

Keep these rules in mind when editing a template:

- Save the file as UTF-8 CSV and keep header names unchanged.
- Use ISO 8601 date and time values with a timezone, for example `2026-09-12T07:30:00.000Z`.
- Use a timezone offset in minutes. JavaScript-style offsets are expected, so India Standard Time is `-330`.
- Use `free_weight`, `machine`, `body_weight`, or `cardio` for exercise types.
- Use `strength`, `duration`, or `calories` for set kinds, with `kg` or `lb` for weight units.
- Use one workout row per set. Leave all set fields blank to import an exercise without sets.
- Use `woman`, `man`, `non_binary`, or `prefer_not_to_say` for BMI gender context.
- Treat the BMI column as a reference only. The app recalculates BMI from the validated canonical weight and height.

### Import safeguards and troubleshooting

- Files are limited to 25 MB and 100,000 records. Expanded ZIP contents have the same size limit.
- ZIP paths, manifests, declared record counts, and SHA-256 checksums are validated before preview.
- Unsupported future backup versions, missing required headers, impossible values, invalid units, and broken record relationships are rejected.
- **No Importable Changes** means the file is already present, contains only older records, or has no safe additions or updates.
- If a standalone CSV cannot be imported into an empty app, create a profile first or restore a JSON or ZIP export that includes profile information.
- If the native share sheet is unavailable or closes with an error, retry on a device with a compatible Files or document-provider app.

Sync is deliberate and file-based. This release does not provide cloud accounts, automatic background sync, deletion propagation, encrypted exports, or an operating-system share destination for inbound files.

## Run locally

Requirements: Node.js 22.23.1 or newer, Yarn 1.22.22, and the current Expo Go app. The Node engine range in `package.json` permits newer compatible releases, while `.nvmrc` supplies the version used by local `nvm` workflows and CI. Yarn remains pinned in `package.json` and the lockfile.

```bash
nvm use
corepack enable
yarn install --frozen-lockfile
yarn start
```

Use `yarn ios` or `yarn android` to open a local simulator/emulator. Add SDK-compatible Expo packages with `npx expo install <package>` and other JavaScript packages with `yarn add <package>`.

## Quality checks

```bash
yarn format:check
yarn typecheck
yarn lint
yarn test
yarn doctor
yarn verify
npx expo export --platform ios
npx expo export --platform android
```

Run `yarn format` to apply the repository-wide Prettier rules and `yarn lint:fix` to apply safe ESLint fixes. EditorConfig and Git attributes enforce UTF-8, two-space indentation, final newlines, and LF line endings across operating systems.

Git hooks are installed automatically by `yarn install`:

- Pre-commit runs ESLint and Prettier only on staged files.
- Commit-msg requires [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(workouts): add interval timer` or `fix(bmi): preserve measurement date`.

The GitHub Actions quality workflow repeats formatting, type, lint, test, Expo Doctor, and commit-message checks. Hooks can be bypassed locally, so CI remains the source of truth.

Maestro journeys live in `e2e/` and require a locally installed native build:

```bash
maestro test e2e/create-workout.yaml
```

## Data model

SQLite is initialized in `src/data/migrations.ts`. Versioned migrations enable foreign keys and WAL journaling. Sessions own ordered exercises, exercises own ordered sets, and optional superset records group contiguous exercises into ordered members and guided rounds. Round entries retain pending, completed, or skipped state and link completed entries to their workout set. Profile-owned superset templates store independent ordered exercise snapshots for reuse. Cascade deletion removes dependent workout data while preserving the reusable exercise catalog. Exercises are categorized as free weight, machine, body weight, or cardio; sets store a validated strength, duration, or calorie payload. BMI measurements are stored independently as a dated history. Entered weight plus full-precision kg/lb values and canonical height in centimetres are persisted; BMI is derived from canonical values instead of being duplicated in storage.

The BMI tab is intended for adults aged 18 and older. BMI is presented as a screening measure rather than a diagnosis; age and gender are retained only as historical context and do not alter the adult calculation.

## Data transfer architecture

The transfer module lives in `src/features/data-transfer/`. It keeps file-format versions independent from SQLite migration versions, so future database changes do not invalidate existing versioned exports. Runtime validation uses Zod, RFC 4180 CSV encoding uses Papa Parse, ZIP handling uses fflate, and SHA-256 checksums use Expo Crypto. Temporary files are stored in a dedicated Expo cache directory, removed after sharing, and purged when the Data & Sync screen opens.

Import inspection parses and validates the complete source before writing. Accepted changes are rechecked and applied in dependency order inside one exclusive SQLite transaction. Catalog entries are reused non-destructively, and a failed write rolls back the complete import.

Focused coverage is provided by:

- `__tests__/data-transfer-csv.test.ts`
- `__tests__/data-transfer-file-codec.test.ts`
- `__tests__/data-transfer-integration.test.ts`
- `__tests__/data-sync-screen.test.tsx`

## Builds and release

`eas.json` contains development, internal-preview, and production profiles. Manual EAS workflows under `.eas/workflows/` create signed iOS and Android builds after the Expo project and store credentials are configured.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest credentials:configure-build --platform ios --profile preview
npx eas-cli@latest credentials:configure-build --platform android --profile preview
npx eas-cli@latest build --profile preview --platform all
```

Production store submission remains manual so a build cannot be released accidentally. Store-ready copy is under `store/en-US/`; the Apple subtitle uses the required shortened form, **Strength Training Journal**.
