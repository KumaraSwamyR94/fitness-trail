# Fitness Trail

**Strength Training Journal & Tracker**

Fitness Trail is an offline-first iOS and Android strength-training and BMI journal built with Expo Router, React Native, TypeScript, and SQLite. It intentionally has no account, cloud API, or analytics dependency.

## Run locally

Requirements: Node.js 22.23.1, Yarn 1.22.22, and the current Expo Go app. The Node and Yarn versions are pinned in `.nvmrc`, `package.json`, and the lockfile so local development and CI use the same toolchain.

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

SQLite is initialized in `data/migrations.ts`. Versioned migrations enable foreign keys and WAL journaling. Sessions own ordered exercises, exercises own ordered sets, and cascade deletion removes dependent workout data while preserving the reusable exercise catalog. Exercises are categorized as free weight, machine, body weight, or cardio; sets store a validated strength, duration, or calorie payload. BMI measurements are stored independently as a dated history. Entered weight plus full-precision kg/lb values and canonical height in centimetres are persisted; BMI is derived from canonical values instead of being duplicated in storage.

The BMI tab is intended for adults aged 18 and older. BMI is presented as a screening measure rather than a diagnosis; age and gender are retained only as historical context and do not alter the adult calculation.

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
