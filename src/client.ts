import {
  mapParams,
  normalizeBaseUrl,
  requestSend,
} from "./core.js";
import type { SendParams, SendResponse } from "./types.js";

/** The API key is read from the constructor argument, else `GOSENT_API_KEY`. */
export type GosentOptions = {
  baseUrl?: string;
  /** Override the fetch implementation (tests, polyfills). */
  fetch?: typeof fetch;
};

/** Send calls for `/v3/email/*`. Every result is `{ data }` or `{ error }` and
 *  never throws for an API error, mirroring Resend's client ergonomics. */
export class Emails {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  /** `POST /v3/email/send`: one email to one or more recipients. */
  async send(params: SendParams): Promise<SendResponse> {
    let payload;
    try {
      payload = mapParams(params);
    } catch (err) {
      return {
        error: {
          statusCode: 0,
          code: "invalid_params",
          message: (err as Error).message,
        },
      };
    }
    return requestSend(this.fetchImpl, "send", this.apiKey, this.baseUrl, payload);
  }

  /** `POST /v3/email/mime`: a pre-built MIME message (raw text or base64). */
  async sendMime(mime: string): Promise<SendResponse> {
    if (typeof mime !== "string" || !mime.trim()) {
      return {
        error: {
          statusCode: 0,
          code: "invalid_params",
          message: "The MIME message must be a non-empty string.",
        },
      };
    }
    return requestSend(this.fetchImpl, "mime", this.apiKey, this.baseUrl, {
      mime_email: mime,
    });
  }
}

/** Gosent Send API client.
 *
 * ```ts
 * import { Gosent } from "@gosent/node";
 * const gosent = new Gosent(process.env.GOSENT_API_KEY);
 * const { data, error } = await gosent.emails.send({
 *   from: "hello@yourdomain.com",
 *   to: "you@example.com",
 *   subject: "Hello",
 *   html: "<p>It works.</p>",
 * });
 * ```
 */
export class Gosent {
  readonly emails: Emails;

  constructor(apiKey?: string, options: GosentOptions = {}) {
    const key = apiKey || process.env.GOSENT_API_KEY || "";
    if (!key) {
      throw new Error(
        "Missing API key. Pass it to `new Gosent(apiKey)` or set GOSENT_API_KEY.",
      );
    }
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new Error("global fetch is unavailable; Node >= 18 is required.");
    }
    this.emails = new Emails(key, baseUrl, fetchImpl);
  }
}
