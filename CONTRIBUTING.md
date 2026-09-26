# Contributing to MotionDeck

Thanks for looking at MotionDeck. The useful way to help is a focused change against the current editor, not a second implementation of the same feature.

Clone [github.com/AWM-OFFICIAL/MotionDeck](https://github.com/AWM-OFFICIAL/MotionDeck).

## Setup

```bash
npm install
npm run dev
```

Desktop shell (optional): install Rust, then `npm run desktop`.

## Checks before a pull request

```bash
npm run typecheck
npm run lint
npm run test
```

If you touch export, crop tracking, or the app-screen path, also run `npm run validate:android-export` on a machine with Chrome or Edge.

## What to keep stable

- Recorded and imported footage both use `VideoLayer`. Do not add a second clip type that disables editing.
- Preview and export both call `renderScene`. Do not add an export-only animation path.
- Crop, motion, camera, and effects stay on the layer. Do not rewrite the source file.
- User-facing errors should say what failed and what to try next. Keep stack traces and native logs in the developer console.

## Adding an animation preset

1. Add the preset in `src/library/motionPresets.ts`.
2. Make sure `src/core/animation.ts` already implements the entrance, idle, or exit id. If it does not, implement it there — the button must not be a label with no motion.
3. Cover the preset with a unit test if the motion math is new.

## Adding a template

Add an entry in `src/library/templates.ts`. Templates should only use fields that already exist on layers. Do not point templates at machine-local files.

## Reporting issues

Include:

- Windows, macOS, or browser
- Whether the clip was recorded in MotionDeck or imported
- Steps, and what you expected
- The export format if the bug is in the rendered file

Do not paste secrets, tokens, or private screen contents you do not want public.

## Pull requests

- Describe the user-visible change and how you tested it.
- Keep the diff limited to the problem.
- Do not upgrade major dependencies unless a test or build is actually broken.
- Do not commit `node_modules`, `dist`, `src-tauri/target`, or local validation videos.
