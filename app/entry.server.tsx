import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { SECURITY_HEADERS } from "./lib/security";

const ABORT_DELAY = 5_000;

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext
) {
  // Add security headers to all responses
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    responseHeaders.set(key, value);
  }

  // Add HSTS in production
  if (process.env.NODE_ENV === "production") {
    responseHeaders.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    // Use onAllReady for bots to ensure full content
    const readyOption = userAgent && isbot(userAgent) ? "onAllReady" : "onShellReady";

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromPassThrough(body);

          responseHeaders.set("Content-Type", "text/html");

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      }
    );

    setTimeout(abort, ABORT_DELAY);
  });
}

function createReadableStreamFromPassThrough(passThrough: PassThrough): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      passThrough.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      passThrough.on("end", () => {
        controller.close();
      });
      passThrough.on("error", (err) => {
        controller.error(err);
      });
    },
    cancel() {
      passThrough.destroy();
    },
  });
}
