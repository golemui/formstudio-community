# src/lib

## community/

Shared with the GolemUI Studio project.

> **Note for GolemUI contributors:** Do not rename or restructure these files.
> The folder names, file names, and exported symbols are a shared contract with
> downstream GolemUI projects -- any change here is a breaking change there.
>
> If you cloned this repo for your own use, feel free to restructure as needed.

| File / Folder       | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `ai.service.ts`     | HTTP + SSE streaming client; base class for PRO service    |
| `public-api.ts`     | Barrel re-exporting the library's public surface           |
| `studio/`           | `FormStudioComponent` -- the main AI form-builder UI       |
| `design/`           | `DesignComponent` and `PropertiesPanelComponent`           |
| `editor/`           | `EditorComponent` -- JSON/code editor pane                 |
| `token-meter/`      | `TokenMeterComponent` -- context-window usage indicator    |
| `typewriter/`       | `TypewriterComponent` -- animated text renderer            |
