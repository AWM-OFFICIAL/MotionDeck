# Security policy

MotionDeck is a local creative tool. It records the screen, reads video files you choose, and writes exports you choose. Please report vulnerabilities privately so they can be fixed before they are discussed in public.

## Report a problem

Prefer a [GitHub security advisory](https://github.com/AWM-OFFICIAL/MotionDeck/security/advisories/new) on [AWM-OFFICIAL/MotionDeck](https://github.com/AWM-OFFICIAL/MotionDeck). If advisories are unavailable, open a private issue and wait for acknowledgement before posting details publicly.

Include:

- MotionDeck version (`package.json` / desktop about build)
- Operating system
- What an attacker can do
- Whether the issue needs a malicious project file, a malicious video, or only normal use

Do not include exploit code for issues that affect other users until a fix is available.

## In scope

- Reading or writing files outside the temp directory, app data, and the folders the user picked in a dialog
- Command execution beyond the fixed FFmpeg conversion of MotionDeck temp files
- Project or media handling that runs attacker-controlled code
- Secrets committed to the repository

## Out of scope

- Screen recording itself, which is the product and requires the user to start a capture
- Missing optional metadata in imported videos
- Issues that require the user to already run untrusted code on their machine

## Supported versions

Security fixes target the current default branch. There is no long-term support branch yet.
