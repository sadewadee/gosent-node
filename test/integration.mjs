// Runs against the REAL portal-api started by sdks/tests/integration.sh.
// GOSENT_API_KEY and API_BASE come from the environment.
import assert from "node:assert/strict";
import { Gosent } from "../dist/index.js";

const { GOSENT_API_KEY: apiKey, API_BASE: baseUrl } = process.env;
assert.ok(apiKey, "GOSENT_API_KEY is required");
assert.ok(baseUrl, "API_BASE is required");

const gosent = new Gosent(apiKey, { baseUrl });
const from = "hello@sdk-test.gosent.net";

// 1. send() (contract §4.1)
{
  const { data, error } = await gosent.emails.send({
    from,
    to: "you@example.com",
    subject: "Hello from Gosent",
    html: "<p>Your first email is on its way.</p>",
  });
  assert.equal(error, undefined, `send failed: ${JSON.stringify(error)}`);
  assert.equal(data.succeeded, 1, `expected 1 accepted, got ${JSON.stringify(data)}`);
  assert.ok(data.emailId, "emailId is empty");
  console.log(`  node send(): 200 succeeded=${data.succeeded} emailId=${data.emailId}`);
}

// 2. sendMime() (contract §4.2)
{
  const mime = [
    `From: ${from}`,
    "To: you@example.com",
    "Subject: Hello from Gosent",
    "",
    "Your first email is on its way.",
  ].join("\r\n");
  const { data, error } = await gosent.emails.sendMime(mime);
  assert.equal(error, undefined, `sendMime failed: ${JSON.stringify(error)}`);
  assert.equal(data.succeeded, 1, `expected 1 accepted, got ${JSON.stringify(data)}`);
  console.log(`  node sendMime(): 200 succeeded=${data.succeeded} emailId=${data.emailId}`);
}

// 3. an unverified sender is refused with the documented 400 + code
{
  const { data, error } = await gosent.emails.send({
    from: "hello@not-verified.gosent.net",
    to: "you@example.com",
    subject: "nope",
    text: "nope",
  });
  assert.equal(data, undefined, "an unverified sender must not succeed");
  assert.equal(error.statusCode, 400, `expected 400, got ${JSON.stringify(error)}`);
  assert.equal(error.code, "SENDER_NOT_VERIFIED");
  console.log(`  node unverified: ${error.statusCode} ${error.code}`);
}
