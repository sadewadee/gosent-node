# @gosent/node

The official Node.js SDK for the [Gosent](https://gosent.net) Send API.

- Send email with a few lines of code.
- ESM, with TypeScript types included.
- No runtime dependencies: it uses the global `fetch` of Node.js 18 and newer.

## Install

```sh
npm install @gosent/node
```

## Quick start

You need a Gosent API key and a verified sender domain on your account.

```js
import { Gosent } from "@gosent/node";

const gosent = new Gosent(process.env.GOSENT_API_KEY);

const { data, error } = await gosent.emails.send({
  from: "hello@yourdomain.com",
  to: "you@example.com",
  subject: "Hello from Gosent",
  html: "<p>Your first email is on its way.</p>",
});

if (error) {
  console.error(error.code, error.message);
} else {
  console.log("Sent", data.emailId);
}
```

When you leave out the API key, the client reads it from the `GOSENT_API_KEY`
environment variable:

```js
import { Gosent } from "@gosent/node";

const gosent = new Gosent();
```

The constructor throws an `Error` when it finds no API key. Apart from that, the SDK
does not throw: `send` and `sendMime` return failures as values (see
[Handling errors](#handling-errors)).

## Sending an email

`gosent.emails.send(params)` sends one email to one or more recipients
(`POST /v3/email/send`).

```js
import { readFile } from "node:fs/promises";
import { Gosent } from "@gosent/node";

const gosent = new Gosent();

const { data, error } = await gosent.emails.send({
  from: "billing@yourdomain.com",
  to: ["alice@example.com", "bob@example.com"],
  cc: "accounts@example.com",
  bcc: ["archive@yourdomain.com"],
  replyTo: "support@yourdomain.com",
  subject: "Your invoice",
  html: "<p>Your invoice is attached.</p>",
  text: "Your invoice is attached.",
  headers: { "X-Campaign": "invoices" },
  attachments: [
    {
      filename: "invoice.pdf",
      content: await readFile("./invoice.pdf"),
      contentType: "application/pdf",
    },
    { filename: "notes.txt", content: "Thank you for your business." },
  ],
});
```

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `from` | `string` | yes | Sender address. Its domain must be a verified sender domain on your account. |
| `to` | `string \| string[]` | yes | One recipient or a list of recipients. |
| `subject` | `string` | no | Subject line. |
| `html` | `string` | no | HTML body. |
| `text` | `string` | no | Plain text body. |
| `cc` | `string \| string[]` | no | Carbon copy recipients. |
| `bcc` | `string \| string[]` | no | Blind carbon copy recipients. |
| `replyTo` | `string` | no | Sent as the `Reply-To` header. |
| `headers` | `Record<string, string>` | no | Extra message headers. |
| `attachments` | `AttachmentInput[]` | no | Files to attach (see below). |

`html` and `text` are both optional for the SDK, but the API needs at least one of them.

### Headers

`headers` is for your own headers, such as `X-Campaign`. The SDK refuses headers that
are set from the top-level fields or by the platform: `From`, `To`, `Cc`, `Bcc`,
`Sender`, `Return-Path`, `Received`, `DKIM-Signature`, `Message-ID`, `Date`,
`MIME-Version`, and any header that starts with `Content-` or `X-Gosent-`. Passing one
of them returns an `invalid_params` error and nothing is sent.

### Attachments

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `filename` | `string` | yes | File name shown to the recipient. |
| `content` | `string \| Uint8Array` | yes | A `string` is treated as UTF-8 text. A `Uint8Array` (or `Buffer`) is sent as raw bytes. The SDK base64 encodes both. |
| `contentType` | `string` | no | MIME type. Defaults to `text/plain` for `.txt`, `text/html` for `.html`, `application/json` for `.json`, and `application/octet-stream` otherwise. |

## Sending a raw MIME message

`gosent.emails.sendMime(mime)` sends a message you already built
(`POST /v3/email/mime`). Pass the complete MIME message as a string, either as raw
text or base64 encoded.

```js
import { Gosent } from "@gosent/node";

const gosent = new Gosent();

const mime = [
  "From: hello@yourdomain.com",
  "To: you@example.com",
  "Subject: Hello from Gosent",
  "",
  "Your first email is on its way.",
].join("\r\n");

const { data, error } = await gosent.emails.sendMime(mime);
```

## Responses

`send` and `sendMime` resolve to `{ data, error }`. Exactly one of the two is set,
and the TypeScript type says so: once you have checked `error`, `data` is known to be
set (and the other way around).

On success, `data` holds the outcome per recipient:

| Field | Type | Description |
| --- | --- | --- |
| `succeeded` | `number` | Number of recipients accepted. |
| `failed` | `number` | Number of recipients refused. |
| `failures` | `string[]` | The refused addresses. |
| `failureDetails` | `{ recipient, reason, error_code }[]` | Why each address was refused. |
| `emailId` | `string` | The id of this email. An empty string when the API did not return one. |
| `sandboxed` | `boolean` (optional) | `true` when the API key is in sandbox mode. |

A successful response can still refuse some recipients, so check `data.failed`.

## Handling errors

A failed request is a value you can branch on. `error` has this shape:

| Field | Type | Description |
| --- | --- | --- |
| `statusCode` | `number` | The HTTP status, or `0` when there was no response or the SDK refused the call before sending it. |
| `code` | `string` | Machine readable error code (see below). |
| `message` | `string` | Human readable description. |
| `requestId` | `string` (optional) | The API's `request_id`. Quote it when you contact support. |
| `retryAfter` | `string` (optional) | The `Retry-After` response header, when the API sent one. |
| `fieldErrors` | `{ fieldName?, message? }` (optional) | The invalid field, on a validation error. |

```js
import { Gosent } from "@gosent/node";

const gosent = new Gosent();

const { data, error } = await gosent.emails.send({
  from: "hello@yourdomain.com",
  to: "you@example.com",
  subject: "Hello from Gosent",
  text: "Your first email is on its way.",
});

if (error) {
  if (error.fieldErrors) {
    console.error(`Invalid ${error.fieldErrors.fieldName}: ${error.fieldErrors.message}`);
  } else if (error.retryAfter) {
    console.error(`${error.code}: retry after ${error.retryAfter}`);
  } else {
    console.error(error.statusCode, error.code, error.message, error.requestId);
  }
} else if (data.failed > 0) {
  console.warn("Some recipients were refused:", data.failureDetails);
}
```

### Error codes set by the SDK

| `code` | `statusCode` | Meaning |
| --- | --- | --- |
| `invalid_params` | `0` | The SDK refused the call before sending it: `from` or `to` is missing, an attachment has no `filename`, a header is not allowed, or the MIME message is empty. |
| `network_error` | `0` | No response: DNS failure, refused connection, or the 30 second timeout. |
| `network_error` | HTTP status | The API answered with a body the SDK could not read (not JSON, or JSON without a `data` object). |
| `UNKNOWN_ERROR` | HTTP status | The API answered with an error but without an error code. |

### Error codes from the API

Any other `code` comes from the API, with the `E_ApiResponseCodes.` prefix removed.
Common ones:

| `statusCode` | `code` | Meaning |
| --- | --- | --- |
| `400` | `NON_VALIDATING_IN_PAYLOAD` | The request is not valid. `error.fieldErrors` names the field. |
| `400` | `SENDER_NOT_VERIFIED` | The `from` domain is not a verified sender domain of your account. |
| `401` | `API_KEY_INVALID` | The API key is unknown or blocked. |
| `403` | `ACCOUNT_SUSPENDED` | The account is suspended. |
| `413` | `PAYLOAD_TOO_LARGE` | The email is larger than the size limit. |
| `429` | `RATE_LIMITED` | Too many requests for this API key. |
| `429` | `MONTHLY_LIMIT_EXCEEDED` | The monthly email limit is reached. `error.retryAfter` says when it resets. |
| `500` | `INTERNAL_ERROR` | Something went wrong on the Gosent side. |
| `503` | `UPSTREAM_TIMEOUT` | The mail server did not answer in time. Retry after `error.retryAfter` seconds. |

See the [Gosent documentation](https://gosent.net/docs) for the full list.

## Sandbox mode and verified senders

The domain of `from` must be a verified sender domain on your account, otherwise the
API answers `400` with `SENDER_NOT_VERIFIED`. While an API key is in sandbox mode,
`data.sandboxed` is `true` and the message is accepted without being delivered.

## Configuration

```js
import { Gosent } from "@gosent/node";

const gosent = new Gosent(process.env.GOSENT_API_KEY, {
  baseUrl: "https://api.gosent.net/v3/",
});
```

| Option | Default | Description |
| --- | --- | --- |
| `apiKey` (first argument) | `process.env.GOSENT_API_KEY` | Your API key. Required: the constructor throws without one. |
| `baseUrl` | `process.env.GOSENT_API_BASE_URL`, then `https://api.gosent.net/v3/` | Base URL of the Send API, including `/v3/`. A missing trailing slash is added. |
| `fetch` | `globalThis.fetch` | A custom `fetch` implementation, for example in tests. |

Requests time out after 30 seconds. The timeout is not configurable. Every request
carries an `X-Gosent-Sdk: gosent-node/<version>` header.

## TypeScript

The package ships its own type declarations. The types used above are exported:

```ts
import {
  Gosent,
  type ApiErrorShape,
  type DataResult,
  type SendParams,
  type SendResponse,
} from "@gosent/node";

const gosent = new Gosent();

const params: SendParams = {
  from: "hello@yourdomain.com",
  to: "you@example.com",
  subject: "Hello from Gosent",
  text: "Your first email is on its way.",
};

const result: SendResponse = await gosent.emails.send(params);

if (result.error) {
  const error: ApiErrorShape = result.error;
  console.error(error.code, error.message);
} else {
  const data: DataResult = result.data;
  console.log("Sent", data.emailId);
}
```

Also exported: `AttachmentInput`, `FailureDetail`, `GosentOptions`, the `VERSION`
constant, and `mapParams(params)`, which returns the request body `send` would post
(and throws on invalid input).

## Requirements

- Node.js 18 or newer.
- ESM only. From CommonJS, load the package with `await import("@gosent/node")`.

## Documentation

- Gosent documentation: https://gosent.net/docs
- SDK documentation: https://gosent.net/docs/sdks

## Development

```sh
npm ci
npm run build
npm test
```

## License

[MIT](LICENSE)
