# PT Checkmate Handoff

## Project

PT Checkmate is a local Chrome / Chromium extension for periodically visiting configured PT sites and optionally clicking check-in buttons.

Repository: https://github.com/Lau0x/pt-checkmate

Current public release: `v0.1.4`

## Core Principles

- Do not store, request, read, or autofill usernames or passwords.
- Use the user's existing Chrome login state via cookies/session.
- Keep all site configuration local in `chrome.storage.local`.
- Do not upload telemetry, site configs, cookies, or run results.
- Keep host permissions optional and request only origins derived from user-configured URLs.
- Treat request-only mode as a lightweight visit mode, not a real check-in mode.

## File Map

- `manifest.json`: Chrome extension manifest, version, permissions, popup, background worker, options page.
- `popup.html`: Browser action popup shell.
- `options.html`: Settings page shell and site form template.
- `src/background.js`: Scheduling, overdue startup catch-up, site visiting, check-in detection, request-only mode.
- `src/options.js`: Settings page persistence, site editing, permission request flow.
- `src/popup.js`: Popup rendering, one-click run, settings-page opening.
- `src/ui.css`: Shared styles for popup and options page.
- `README.md`: Public user-facing documentation.
- `dist/`: Ignored generated release zip files.

## Behavior Summary

Scheduling:

- Default interval is 21 days.
- Default schedule time is local `11:00`.
- The extension stores the next scheduled run in local storage.
- If Chrome was closed at the scheduled time, startup checks whether the run is overdue and performs a catch-up run.

Visit modes:

- `background`: Opens a background tab, injects content script, can click buttons.
- `foreground`: Opens and focuses a tab, useful for debugging.
- `request`: Does not open a tab. Performs `fetch(..., { credentials: "include" })`. This can help with visit-only keepalive, but it does not execute page JS and cannot click check-in buttons.

Check-in detection:

- Detect password fields and report `需要手动登录`.
- Detect already-done keywords before clicking, such as `已签到`, `今日已签到`, `签到成功`, `already checked`.
- When a selector or keyword target is clicked, return success immediately to avoid page reloads being reported as extension failures.

## Commands

Syntax checks:

```bash
node --check src/background.js
node --check src/options.js
node --check src/popup.js
```

Create a release zip after committing:

```bash
git archive --format=zip --prefix=pt-checkmate/ -o dist/pt-checkmate-vX.Y.Z.zip HEAD
```

Tag and publish a release:

```bash
git tag vX.Y.Z
git push origin main --tags
gh release create vX.Y.Z dist/pt-checkmate-vX.Y.Z.zip --title "PT Checkmate vX.Y.Z" --notes "Release notes here."
```

## Release Checklist

1. Update `manifest.json` version.
2. Update README download filename if the release zip name changes.
3. Run the syntax checks.
4. Build the zip with `git archive`.
5. Confirm the zip contains only project files.
6. Commit changes.
7. Tag and push.
8. Create a GitHub Release and upload the zip.

## UI Notes

- Options page depends on Chrome extension APIs and will not run directly as plain HTML without mocks.
- For UI preview, use a temporary local preview file or mocked page, but do not commit preview artifacts.
- Keep the interface quiet and utilitarian. This is a configuration tool, not a marketing page.
- Site card header should keep the enable switch, site title, and delete action compact. Avoid the old layout where `启用` wrapped into two lines.

## Known Constraints

- No local extension can run while the computer and Chrome are fully closed.
- Request-only mode may not work on every site because login cookies, redirects, CSRF, and SameSite behavior vary by site.
- Some PT sites use dynamic buttons, anti-bot checks, or Cloudflare pages. Prefer foreground mode for debugging those.
- Firefox is not currently tested.

## Safe Change Boundaries

- Keep changes small and explicit.
- Do not add password storage, credential filling, cloud sync, telemetry, or remote config.
- Do not hardcode real PT site names, URLs, cookies, or user-specific configuration into the repo.
- Do not add build tooling unless there is a concrete need.
