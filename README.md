# @gosent/node

Official Node.js SDK for the Gosent Send API. Send email with a few lines of code.

Requires Node.js 18 or newer. No runtime dependencies (uses the global `fetch`).

## Install

This package is not published to npm yet. Install it from the repository:

```sh
npm install /path/to/gosent-portal/sdks/node
```

Or add it as a local dependency in your `package.json`:

```json
{ "dependencies": { "@gosent/node": "file:../sdks/node" } }
```

Then build it once (TypeScript to `dist/`):

```sh
cd sdks/node && npm ci && npm run build
```

## Send your first email

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
  console.log("sent", data.emailId);
}
```

The API key defaults to `process.env.GOSENT_API_KEY` when you omit it:

```js
const gosent = new Gosent();
```

## Send a raw MIME message

```js
const mime = [
  "From: hello@yourdomain.com",
  "To: you@example.com",
  "Subject: Hello from Gosent",
  "",
  "Your first email is on its way.",
].join("\r\n");

const { data, error } = await gosent.emails.sendMime(mime);
```

## Field mapping

The friendly fields map onto the Send API wire format (`docs/sending-contract.md` §4):

| SDK | API |
| --- | --- |
| `from` | `sender` |
| `to`, `cc`, `bcc` | arrays of the same name (a string becomes a one-element array) |
| `html` | `html_body` |
| `text` | `text_body` |
| `replyTo` | a `Reply-To` entry in `custom_headers` |
| `headers` | `custom_headers` |
| `attachments[].filename` | `attachments[].filename` |
| `attachments[].content` | `attachments[].fileblob` (base64: a `string` is UTF-8 encoded, a `Uint8Array`/`Buffer` is used as-is) |
| `attachments[].contentType` | `attachments[].mimetype` |

`from` and `to` are required. `html` and `text` are both optional, but the API needs at
least one of them.

## Handling errors

`send` and `sendMime` never throw for an API error. They return `{ data }` on success and
`{ error }` otherwise, so a failed request is a value you can branch on:

```js
const { data, error } = await gosent.emails.send({ from, to, subject, text });

if (error) {
  // error.statusCode  e.g. 401
  // error.code        e.g. "API_KEY_INVALID" (the E_ApiResponseCodes. prefix is stripped)
  // error.message     human readable
  // error.requestId   the request_id from the envelope, when present
  // error.retryAfter  the Retry-After header on a 429, when present
  // error.fieldErrors { fieldName, message } on a 400 validation error
}
```

On success `data` carries the per-recipient outcome:

```js
data.succeeded       // number accepted
data.failed          // number refused
data.failures        // refused addresses
data.failureDetails  // [{ recipient, reason, error_code }]
data.emailId         // the email_id for this send
data.sandboxed       // true only when the API key is in sandbox mode
```

A transport failure (DNS, connection refused, timeout) comes back as
`error.code === "network_error"` with `statusCode: 0`. `error.code === "invalid_params"`
means the SDK rejected the call before sending it (for example a missing `from`).

Common status codes: `400` bad payload, `401` missing or invalid key, `403` suspended or
unauthorized account, `429` monthly limit reached (check `error.retryAfter`), `500`
server error.

## Sandbox and verified sender

The `From` domain must be a verified sender domain on your account, otherwise the API
answers `400` (`SENDER_NOT_VERIFIED`). While a key is in sandbox mode, `data.sandboxed`
is `true` and the message is accepted without delivery.

## License

UNLICENSED.
