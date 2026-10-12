import {
  ApiErrorShape,
  AttachmentInput,
  DataResult,
  FailureDetail,
  SendPayload,
  SendResponse,
  SendParams,
} from "./types.js";

export const VERSION = "0.1.0";
const DEFAULT_BASE_URL = "https://api.gosent.net/v3/";

function asStr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function normalizeBaseUrl(baseUrl?: string): string {
  const raw = (baseUrl || process.env.GOSENT_API_BASE_URL || DEFAULT_BASE_URL).trim();
  return raw.endsWith("/") ? raw : `${raw}/`;
}

/** UTF-8 string -> base64, robust for non-ASCII (never the Latin-1 `btoa` trap). */
function b64EncodeUtf8(value: string): string {
  return bytesToB64(new TextEncoder().encode(value));
}

function bytesToB64(bytes: Uint8Array): string {
  // Chunked: `String.fromCharCode(...bytes)` overflows the stack past a few
  // hundred KB, and attachments may be up to the 25 MB API limit.
  let bin = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(bin);
}

/** A string is UTF-8 text; a Uint8Array/Buffer is raw bytes. Both go to the API
 *  as base64 (`fileblob`). */
function normalizeAttachment(
  a: AttachmentInput
): { filename: string; fileblob: string; mimetype: string } {
  const filename = asStr(a.filename);
  if (!filename) throw new Error("attachment.filename is required");
  const blob =
    typeof a.content === "string" ? b64EncodeUtf8(a.content) : bytesToB64(a.content);
  let mimetype = asStr(a.contentType);
  if (!mimetype) {
    if (filename.toLowerCase().endsWith(".txt")) mimetype = "text/plain";
    else if (filename.toLowerCase().endsWith(".html")) mimetype = "text/html";
    else if (filename.toLowerCase().endsWith(".json")) mimetype = "application/json";
    else mimetype = "application/octet-stream";
  }
  return { filename, fileblob: blob, mimetype };
}

// Mirrors the headers the Send API refuses. Failing here is friendlier than a 400,
// but the API is the authority.
const FORBIDDEN_HEADERS = new Set([
  "from", "to", "cc", "bcc", "sender", "return-path", "received", "dkim-signature",
  "message-id", "date", "mime-version",
]);
const FORBIDDEN_PREFIXES = ["content-", "x-gosent-"];

function assertHeaderAllowed(name: string): void {
  const lower = name.toLowerCase();
  if (
    FORBIDDEN_HEADERS.has(lower) ||
    FORBIDDEN_PREFIXES.some((p) => lower.startsWith(p))
  )
    throw new Error(`Header '${name}' may not be set via headers; use the top-level field.`);
}

function buildCustomHeaders(params: SendParams): { header: string; value: string }[] {
  const out: { header: string; value: string }[] = [];
  if (params.replyTo) out.push({ header: "Reply-To", value: params.replyTo });
  for (const [key, value] of Object.entries(params.headers || {})) {
    assertHeaderAllowed(key);
    out.push({ header: key, value: asStr(value) });
  }
  return out;
}

/** Map the friendly `from`/`to`/`html`/... shapes into the Send API wire format.
 *  Public so callers can inspect what would be sent; used by send(). */
export function mapParams(params: SendParams): SendPayload {
  const from = asStr(params.from);
  const to = toArray(params.to);
  if (!from) throw new Error("From is required.");
  if (!to.length) throw new Error("To is required.");
  const cc = toArray(params.cc);
  const bcc = toArray(params.bcc);
  const headers = buildCustomHeaders(params);
  return {
    sender: from,
    to,
    ...(cc.length ? { cc } : {}),
    ...(bcc.length ? { bcc } : {}),
    ...(params.subject ? { subject: params.subject } : {}),
    ...(params.html ? { html_body: params.html } : {}),
    ...(params.text ? { text_body: params.text } : {}),
    ...(headers.length ? { custom_headers: headers } : {}),
    ...(params.attachments?.length
      ? { attachments: params.attachments.map(normalizeAttachment) }
      : {}),
  };
}

const ERROR_PREFIX = "E_ApiResponseCodes.";

export function stripErrorCode(code: string): string {
  return code.startsWith(ERROR_PREFIX) ? code.slice(ERROR_PREFIX.length) : code;
}

function parseEnvelope(json: unknown): { request_id: string; data: any } {
  if (!json || typeof json !== "object") {
    throw new Error("The server sent a non-JSON envelope.");
  }
  const record = json as Record<string, unknown>;
  const request_id = asStr(record.request_id);
  const data = record.data;
  if (typeof data !== "object" || data === null) {
    throw new Error("The server sent an envelope without a data object.");
  }
  return { request_id, data };
}

function toDataResult(data: any): DataResult {
  const failureDetails = Array.isArray(data.failure_details)
    ? (data.failure_details as FailureDetail[]).filter(
        (f) => f && typeof f === "object"
      )
    : [];
  return {
    succeeded: Number(data.succeeded ?? 0),
    failed: Number(data.failed ?? 0),
    failures: Array.isArray(data.failures) ? data.failures.map(asStr) : [],
    failureDetails,
    emailId: asStr(data.email_id),
    ...(data.sandboxed === undefined ? {} : { sandboxed: Boolean(data.sandboxed) }),
  };
}

export function toErrorShape(
  statusCode: number,
  data: any,
  requestId: string,
  retryAfter?: string,
): ApiErrorShape {
  const d = data && typeof data === "object" ? data : {};
  const validation = d.field_validation_errors;
  return {
    statusCode,
    code: stripErrorCode(asStr(d.error_code) || "UNKNOWN_ERROR"),
    message: asStr(d.error) || `Request failed with status ${statusCode}`,
    ...(requestId ? { requestId } : {}),
    ...(retryAfter ? { retryAfter } : {}),
    ...(validation && typeof validation === "object"
      ? {
          fieldErrors: {
            fieldName: asStr((validation as any).fieldname),
            message: asStr((validation as any).message),
          },
        }
      : {}),
  };
}

/** Send the payload to `POST /v3/email/<endpoint>`. Returns `{data}` on 2xx and
 *  `{error}` otherwise (never throws for an API error; a network failure is an
 *  `error` with `code: network_error`). */
export async function requestSend(
  fetchImpl: typeof fetch,
  endpoint: "send" | "mime",
  apiKey: string,
  baseUrl: string,
  payload: unknown,
  timeoutMs = 30_000,
): Promise<SendResponse> {
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}email/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        "X-Gosent-Sdk": `gosent-node/${VERSION}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "TimeoutError";
    return {
      error: {
        statusCode: 0,
        code: "network_error",
        message: aborted
          ? "The request to Gosent timed out."
          : (err as Error).message || "network_error",
      },
    };
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    if (res.ok) {
      return {
        error: {
          statusCode: res.status,
          code: "network_error",
          message: "The server returned a non-JSON success response.",
        },
      };
    }
  }
  if (res.ok) {
    try {
      const env = parseEnvelope(json);
      return { data: toDataResult(env.data) };
    } catch (err) {
      return {
        error: {
          statusCode: res.status,
          code: "network_error",
          message: (err as Error).message,
        },
      };
    }
  }
  try {
    const env = parseEnvelope(json);
    return {
      error: toErrorShape(
        res.status,
        env.data,
        env.request_id,
        res.headers.get("retry-after") || undefined,
      ),
    };
  } catch {
    return {
      error: {
        statusCode: res.status,
        code: "network_error",
        message: `The server answered HTTP ${res.status} with a non-JSON envelope.`,
      },
    };
  }
}