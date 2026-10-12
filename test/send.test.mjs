// Unit tests for @gosent/node against a loopback stub that speaks the Send API
// envelope (docs/sending-contract.md §4). No network, no Postgres.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Gosent, mapParams } from "../dist/index.js";

const KEY = "api-" + "K".repeat(40); // matches the API's ^api-[A-Za-z0-9]{40}$
const okEnvelope = (data, requestId = "4c1f3d1a-test") => ({
  request_id: requestId,
  data,
});

/** Boot a loopback stub; returns the client plus every request it saw. */
async function stub(handler) {
  const seen = [];
  const srv = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const record = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: raw ? JSON.parse(raw) : null,
      };
      seen.push(record);
      handler(record, res);
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const baseUrl = `http://127.0.0.1:${srv.address().port}/v3/`;
  const client = new Gosent(KEY, { baseUrl });
  return { client, seen, close: () => new Promise((r) => srv.close(r)) };
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(payload));
}

test("sends the API key header and a mapped JSON body", async () => {
  const { client, seen, close } = await stub((_req, res) =>
    json(res, 200, okEnvelope({
      succeeded: 1, failed: 0, failures: [], failure_details: [], email_id: "em_1",
    })),
  );
  const { data, error } = await client.emails.send({
    from: "hello@yourdomain.com",
    to: ["a@example.com", "b@example.com"],
    subject: "Hi",
    html: "<p>ho</p>",
    text: "ho",
    cc: "c@example.com",
    replyTo: "reply@yourdomain.com",
    headers: { "X-Campaign": "welcome" },
  });
  await close();

  assert.equal(error, undefined);
  assert.equal(data.emailId, "em_1");
  assert.equal(data.succeeded, 1);

  const req = seen[0];
  assert.equal(req.method, "POST");
  assert.equal(req.url, "/v3/email/send");
  assert.equal(req.headers["x-api-key"], KEY);
  assert.match(req.headers["content-type"], /application\/json/);
  assert.equal(req.body.sender, "hello@yourdomain.com");
  assert.deepEqual(req.body.to, ["a@example.com", "b@example.com"]);
  assert.deepEqual(req.body.cc, ["c@example.com"]);
  assert.equal(req.body.html_body, "<p>ho</p>");
  assert.equal(req.body.text_body, "ho");
  assert.deepEqual(req.body.custom_headers, [
    { header: "Reply-To", value: "reply@yourdomain.com" },
    { header: "X-Campaign", value: "welcome" },
  ]);
});

test("sendMime posts the mime_email field", async () => {
  const { client, seen, close } = await stub((_req, res) =>
    json(res, 200, okEnvelope({
      succeeded: 1, failed: 0, failures: [], failure_details: [], email_id: "em_mime",
    })),
  );
  const mime = "From: a@yourdomain.com\r\nTo: b@example.com\r\nSubject: M\r\n\r\nbody";
  const { data, error } = await client.emails.sendMime(mime);
  await close();
  assert.equal(error, undefined);
  assert.equal(data.emailId, "em_mime");
  assert.equal(seen[0].url, "/v3/email/mime");
  assert.equal(seen[0].body.mime_email, mime);
});

test("parses a sandboxed 200", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 200, okEnvelope({
      succeeded: 1, failed: 0, failures: [], failure_details: [],
      email_id: "em_sbx", sandboxed: true,
    })),
  );
  const { data, error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error, undefined);
  assert.equal(data.sandboxed, true);
});

test("parses a partial 200 with failure details", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 200, okEnvelope({
      succeeded: 1, failed: 1,
      failures: ["bad@example.com"],
      failure_details: [
        { recipient: "bad@example.com", reason: "Recipient refused.", error_code: "INVALID_RECIPIENT" },
      ],
      email_id: "em_part",
    })),
  );
  const { data, error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error, undefined);
  assert.equal(data.succeeded, 1);
  assert.equal(data.failed, 1);
  assert.deepEqual(data.failures, ["bad@example.com"]);
  assert.equal(data.failureDetails[0].recipient, "bad@example.com");
  assert.equal(data.failureDetails[0].error_code, "INVALID_RECIPIENT");
});

test("400 field errors carry the field name and strip the error-code prefix", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 400, okEnvelope({
      error_code: "E_ApiResponseCodes.NON_VALIDATING_IN_PAYLOAD",
      error: "The request body is not valid.",
      field_validation_errors: { fieldname: "sender", message: "'sender' must be an email." },
    })),
  );
  const { data, error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(data, undefined);
  assert.equal(error.statusCode, 400);
  assert.equal(error.code, "NON_VALIDATING_IN_PAYLOAD");
  assert.deepEqual(error.fieldErrors, { fieldName: "sender", message: "'sender' must be an email." });
});

test("401 maps to API_KEY_INVALID", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 401, okEnvelope({
      error_code: "E_ApiResponseCodes.API_KEY_INVALID",
      error: "The API key is not valid.",
    })),
  );
  const { error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error.statusCode, 401);
  assert.equal(error.code, "API_KEY_INVALID");
});

test("403 maps to ACCOUNT_SUSPENDED", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 403, okEnvelope({
      error_code: "E_ApiResponseCodes.ACCOUNT_SUSPENDED",
      error: "The account is suspended.",
    })),
  );
  const { error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error.statusCode, 403);
  assert.equal(error.code, "ACCOUNT_SUSPENDED");
});

test("429 surfaces MONTHLY_LIMIT_EXCEEDED with Retry-After", async () => {
  const { client, close } = await stub((_req, res) =>
    json(
      res,
      429,
      okEnvelope({
        error_code: "E_ApiResponseCodes.MONTHLY_LIMIT_EXCEEDED",
        error: "The monthly limit has been reached.",
      }),
      { "Retry-After": "3600" },
    ),
  );
  const { error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error.statusCode, 429);
  assert.equal(error.code, "MONTHLY_LIMIT_EXCEEDED");
  assert.equal(error.retryAfter, "3600");
});

test("500 maps to INTERNAL_ERROR", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 500, okEnvelope({
      error_code: "E_ApiResponseCodes.INTERNAL_ERROR",
      error: "Something went wrong.",
    })),
  );
  const { error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error.statusCode, 500);
  assert.equal(error.code, "INTERNAL_ERROR");
});

test("a refused connection becomes a network_error, not a throw", async () => {
  const client = new Gosent(KEY, { baseUrl: "http://127.0.0.1:1/v3/" });
  const { data, error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  assert.equal(data, undefined);
  assert.equal(error.code, "network_error");
  assert.equal(error.statusCode, 0);
});

test("mapParams rejects forbidden and prefixed headers", () => {
  assert.throws(
    () => mapParams({ from: "a@yourdomain.com", to: "b@example.com", headers: { "Content-Type": "x" } }),
    /may not be set/,
  );
  assert.throws(
    () => mapParams({ from: "a@yourdomain.com", to: "b@example.com", headers: { "X-Gosent-Api-Key-Id": "x" } }),
    /may not be set/,
  );
  assert.throws(
    () => mapParams({ from: "a@yourdomain.com", to: "b@example.com", headers: { From: "x@y.z" } }),
    /may not be set/,
  );
});

test("attachments are base64-encoded UTF-8 with a default mimetype", async () => {
  const { client, seen, close } = await stub((_req, res) =>
    json(res, 200, okEnvelope({
      succeeded: 1, failed: 0, failures: [], failure_details: [], email_id: "em_att",
    })),
  );
  await client.emails.send({
    from: "a@yourdomain.com",
    to: "b@example.com",
    attachments: [{ filename: "catatan.txt", content: "héllo" }],
  });
  await close();
  const att = seen[0].body.attachments[0];
  assert.equal(att.filename, "catatan.txt");
  assert.equal(att.mimetype, "text/plain");
  assert.equal(Buffer.from(att.fileblob, "base64").toString("utf8"), "héllo");
});

test("a missing API key throws at construction", () => {
  const saved = process.env.GOSENT_API_KEY;
  delete process.env.GOSENT_API_KEY;
  try {
    assert.throws(() => new Gosent(), /Missing API key/);
  } finally {
    if (saved !== undefined) process.env.GOSENT_API_KEY = saved;
  }
});

test("a large attachment encodes without a stack overflow", async () => {
  const { client, seen, close } = await stub((_req, res) =>
    json(res, 200, okEnvelope({
      succeeded: 1, failed: 0, failures: [], failure_details: [], email_id: "em_big",
    })),
  );
  const big = Buffer.alloc(600_000, 0x41); // 600 KB, past the spread-arg limit
  await client.emails.send({
    from: "a@yourdomain.com",
    to: "b@example.com",
    attachments: [{ filename: "big.bin", content: big, contentType: "application/octet-stream" }],
  });
  await close();
  const decoded = Buffer.from(seen[0].body.attachments[0].fileblob, "base64");
  assert.equal(decoded.length, big.length);
  assert.equal(decoded[0], 0x41);
});

test("an API error carries the envelope request_id", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 401, {
      request_id: "req-abc-123",
      data: { error_code: "E_ApiResponseCodes.API_KEY_INVALID", error: "not valid" },
    }),
  );
  const { error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error.requestId, "req-abc-123");
});

test("an envelope without email_id gives an empty emailId, not the request_id", async () => {
  const { client, close } = await stub((_req, res) =>
    json(res, 200, {
      request_id: "req-not-an-email-id",
      data: { succeeded: 1, failed: 0, failures: [], failure_details: [] },
    }),
  );
  const { data, error } = await client.emails.send({ from: "a@yourdomain.com", to: "b@example.com" });
  await close();
  assert.equal(error, undefined);
  assert.equal(data.emailId, "");
});
