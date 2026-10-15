// Compile-time checks for the public types, run by `npm test` through
// `tsc -p test/tsconfig.json`. A broken expectation fails the type check.
import type { ApiErrorShape, DataResult, SendResponse } from "../dist/index.js";

declare const result: SendResponse;

// Checking `error` narrows `data`, also after destructuring.
const { data, error } = result;
if (error) {
  const failure: ApiErrorShape = error;
  // @ts-expect-error data is undefined when error is set
  data.emailId;
} else {
  const success: DataResult = data;
}

if (result.error) {
  const failure: ApiErrorShape = result.error;
} else {
  const success: DataResult = result.data;
}

if (result.data) {
  const success: DataResult = result.data;
  const noError: undefined = result.error;
}

// @ts-expect-error data may be undefined until error or data is checked
result.data.emailId;

// @ts-expect-error a response never carries both data and error
const both: SendResponse = { data: {} as DataResult, error: {} as ApiErrorShape };
