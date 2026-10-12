/** One refused recipient (contract §4.1). */
export type FailureDetail = {
  recipient: string;
  reason: string;
  error_code: string;
};

/** The parsed `data` field when the API answered HTTP 2xx (send/sendMime). */
export type DataResult = {
  succeeded: number;
  failed: number;
  failures: string[];
  failureDetails: FailureDetail[];
  emailId: string;
  sandboxed?: boolean;
};

/** Non-2xx (or network) failure, using the envelope's `error_code` minus the
 *  `E_ApiResponseCodes.` prefix the server sends (contract §4.3). */
export type ApiErrorShape = {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
  retryAfter?: string;
  fieldErrors?: { fieldName?: string; message?: string };
};

export type SendResponse = { data?: DataResult; error?: ApiErrorShape };

/** A single file to attach. A `string` is UTF-8 text and is base64-encoded; a
 *  `Uint8Array`/`Buffer` is raw bytes and is base64-encoded as-is. */
export type AttachmentInput = {
  filename: string;
  content: string | Uint8Array;
  contentType?: string;
};

/** Everything `emails.send` accepts. Header-rejecting fields never reach the
 *  API: `replyTo` becomes a `Reply-To` custom header, `headers` become
 *  `custom_headers` (both contract §4.1 semantics are built here). */
export type SendParams = {
  from: string;
  to: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: AttachmentInput[];
};

/** The wire object the API expects, after mapping (contract §4.1). */
export type SendPayload = {
  sender: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  html_body?: string;
  text_body?: string;
  custom_headers?: { header: string; value: string }[];
  attachments?: { filename: string; fileblob: string; mimetype: string }[];
};