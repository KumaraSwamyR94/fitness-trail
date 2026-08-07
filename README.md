# Fitness Trail

**Strength Training Journal & Tracker**

Fitness Trail is an offline-first iOS and Android strength-training and BMI journal built with Expo Router, React Native, TypeScript, and SQLite. It intentionally has no account, cloud API, or analytics dependency.

## Run locally

Requirements: Node.js 22+, Yarn 1.x, and the current Expo Go app.

```bash
yarn install
yarn start
```

Use `yarn ios` or `yarn android` to open a local simulator/emulator. Add SDK-compatible Expo packages with `npx expo install <package>` and other JavaScript packages with `yarn add <package>`.

## Quality checks

```bash
yarn typecheck
yarn lint
yarn test
npx expo-doctor
npx expo export --platform ios
npx expo export --platform android
```

Maestro journeys live in `e2e/` and require a locally installed native build:

```bash
maestro test e2e/create-workout.yaml
```

## Data model

SQLite is initialized in `data/migrations.ts`. Versioned migrations enable foreign keys and WAL journaling. Sessions own ordered exercises, exercises own ordered sets, and cascade deletion removes dependent workout data while preserving the reusable exercise catalog. BMI measurements are stored independently as a dated history. Entered weight plus full-precision kg/lb values and canonical height in centimetres are persisted; BMI is derived from canonical values instead of being duplicated in storage.

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
