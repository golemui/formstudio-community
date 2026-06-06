# src/api

## community/

Shared with the GolemUI Studio project.

> **Note for GolemUI contributors:** Do not rename or restructure these files.
> The folder name, file names, and exported symbols are a shared contract with
> downstream GolemUI projects -- any change here is a breaking change there.
>
> If you cloned this repo for your own use, feel free to restructure as needed.

| File              | Purpose                                      |
| ----------------- | -------------------------------------------- |
| `chat-handler.ts` | Core SSE streaming handler for `/api/chat`   |
| `golem-prompt.ts` | System prompt and message-building utilities |
| `index.ts`        | Cloudflare Worker entry point                |
