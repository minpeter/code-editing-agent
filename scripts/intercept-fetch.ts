import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("/tmp/fetch-capture", { recursive: true });

let callNum = 0;
const origFetch = globalThis.fetch;

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) {
    return chunks[0];
  }
  return chunks.reduce((acc, c) => {
    const buf = new Uint8Array(acc.length + c.length);
    buf.set(acc);
    buf.set(c, acc.length);
    return buf;
  }, new Uint8Array(0));
}

async function drainStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value instanceof Uint8Array ? value : new Uint8Array(value));
  }
  return new TextDecoder().decode(concatChunks(chunks));
}

async function readBodyToString(
  body: NonNullable<RequestInit["body"]>
): Promise<string> {
  if (typeof body === "string") {
    return body;
  }
  if (body instanceof URLSearchParams) {
    return body.toString();
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body);
  }
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof Blob) {
    return await body.text();
  }
  if (body instanceof ReadableStream) {
    return drainStream(body);
  }
  return String(body);
}

function extractHeaders(init?: RequestInit): Record<string, string> {
  const headers: Record<string, string> = {};
  if (!init?.headers) {
    return headers;
  }
  const h = init.headers;
  if (h instanceof Headers) {
    h.forEach((v, k) => {
      headers[k] = v;
    });
  } else if (Array.isArray(h)) {
    for (const [k, v] of h) {
      headers[k] = v;
    }
  } else {
    Object.assign(headers, h);
  }
  return headers;
}

function redactHeaders(
  headers: Record<string, string>
): Record<string, string> {
  const redacted = { ...headers };
  if (redacted.authorization) {
    redacted.authorization = "***REDACTED***";
  }
  return redacted;
}

function writeCapture(
  num: number,
  parsed: Record<string, unknown>,
  meta: Record<string, unknown>
): void {
  writeFileSync(
    `/tmp/fetch-capture/req-${num}.json`,
    JSON.stringify(parsed, null, 2)
  );
  writeFileSync(
    `/tmp/fetch-capture/req-${num}-meta.json`,
    JSON.stringify(meta, null, 2)
  );
}

function captureStreamInBackground(
  stream: ReadableStream,
  num: number,
  status: number
): void {
  (async () => {
    try {
      const text = await drainStream(stream);
      writeFileSync(`/tmp/fetch-capture/resp-${num}.txt`, text);
      process.stderr.write(
        `[fetch #${num}] → ${status} (streaming) ${text.length}B captured\n`
      );
    } catch (err) {
      process.stderr.write(
        `[fetch #${num}] ⚠ stream capture failed: ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  })();
}

globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const num = ++callNum;
  const url = typeof input === "string" ? input : input.toString();

  if (!url.includes("chat/completions")) {
    return origFetch(input, init);
  }

  const method = init?.method || "GET";
  const headers = extractHeaders(init);

  let bodyStr = "";
  if (init?.body) {
    bodyStr = await readBodyToString(init.body);
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(bodyStr);
  } catch (err) {
    if (bodyStr.length > 0) {
      process.stderr.write(
        `[fetch #${num}] ⚠ body parse failed (${bodyStr.length}B): ${err instanceof Error ? err.message : String(err)}\n`
      );
    }
  }

  const msgCount = Array.isArray(parsed.messages) ? parsed.messages.length : 0;
  const isStream = parsed.stream === true;
  const model = parsed.model || "?";

  writeCapture(num, parsed, {
    num,
    url,
    method,
    model,
    msgCount,
    isStream,
    headers: redactHeaders(headers),
    bodyBytes: bodyStr.length,
  });

  process.stderr.write(
    `[fetch #${num}] ${method} ${url.split("/").pop()} model=${model} msgs=${msgCount} stream=${isStream} body=${bodyStr.length}B\n`
  );

  const resp = await origFetch(input, init);

  if (isStream && resp.body) {
    const [forCapture, forCaller] = resp.body.tee();
    captureStreamInBackground(forCapture, num, resp.status);
    return new Response(forCaller, {
      status: resp.status,
      statusText: resp.statusText,
      headers: resp.headers,
    });
  }

  if (isStream) {
    process.stderr.write(
      `[fetch #${num}] → ${resp.status} (streaming, no body)\n`
    );
  } else {
    const clone = resp.clone();
    const text = await clone.text();
    writeFileSync(`/tmp/fetch-capture/resp-${num}.json`, text);
    process.stderr.write(`[fetch #${num}] → ${resp.status} ${text.length}B\n`);
  }

  return resp;
};
