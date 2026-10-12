# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added

- `Gosent` client: `new Gosent(apiKey?, { baseUrl?, fetch? })`. The API key falls
  back to `GOSENT_API_KEY` and the base URL to `GOSENT_API_BASE_URL`, then to
  `https://api.gosent.net/v3/`.
- `gosent.emails.send()` for `POST /v3/email/send` with `from`, `to`, `cc`, `bcc`,
  `subject`, `html`, `text`, `replyTo`, `headers` and `attachments`.
- `gosent.emails.sendMime()` for `POST /v3/email/mime` with a pre-built MIME message.
- Every call resolves to `{ data, error }` and never throws for an API or network
  error. Error codes from the API are returned without the `E_ApiResponseCodes.`
  prefix, together with the request id, the `Retry-After` header and field
  validation errors when present.
- Attachments from a UTF-8 string or raw bytes (`Uint8Array` or `Buffer`), base64
  encoded by the SDK, with a default content type based on the file extension.
- Headers that must be set through top-level fields (`From`, `To`, `Content-*`,
  `X-Gosent-*` and others) are rejected before the request is sent.
- `mapParams()` to inspect the request body the SDK would send, and the `VERSION`
  constant.
- Requests time out after 30 seconds and carry an `X-Gosent-Sdk: gosent-node/<version>`
  header.
- ESM only, with TypeScript declarations. Requires Node.js 18 or newer. No runtime
  dependencies.
