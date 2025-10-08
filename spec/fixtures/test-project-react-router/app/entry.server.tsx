import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToString } from "react-dom/server";

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  let html = renderToString(<ServerRouter context={reactRouterContext} url={request.url} />);

  return new Response("<!DOCTYPE html>" + html, {
    headers: { "Content-Type": "text/html" },
    status: responseStatusCode,
  });
}
