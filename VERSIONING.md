# Versioning & Release Tags

FormStudio Community and golemui each have their **own, independent release
cycle**. To make a release's dependency provenance visible at a glance, the
GitHub release tag embeds the versions it was built against, using SemVer
**build metadata** (the part after `+`, which is valid in a git tag and is
ignored for version precedence).

## Format

```
v{app}+gui.{golemui}
```

Example:

```
v0.0.1+gui.1.0.1
```

- `{app}` - this repo's own version (the `version` in `package.json`).
- `{golemui}` - the `@golemui/*` version this build depends on.

## The app version is independent of golemui's

The two cycles are independent: the app version tracks **FormStudio Community's
own changes**, on its own schedule. It is **not** a mirror of golemui's version,
and there is no fixed "golemui patch -> app patch" mapping.

Example - the app releases on its own cadence; the suffix just follows along:

```
v0.0.1+gui.1.0.1   app fix, built on golemui 1.0.1
v0.0.2+gui.1.0.1   another app fix, golemui unchanged
v0.0.3+gui.1.2.0   app release that happens to pick up newer golemui
v0.1.0+gui.1.2.0   new app feature, golemui unchanged
```
