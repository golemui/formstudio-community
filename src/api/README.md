# src/api

## community/

Shared with other projects.

> **Do not rename or restructure these files.** The folder name, file names, and
> exported symbols are a public contract -- any change is a breaking change for
> every downstream consumer.

| File               | Purpose                                               |
| ------------------ | ----------------------------------------------------- |
| `chat-handler.ts`  | Core SSE streaming handler for `/api/chat`            |
| `golem-prompt.ts`  | System prompt and message-building utilities          |
| `index.ts`         | Cloudflare Worker entry point                         |
