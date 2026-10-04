import { NextRequest } from "next/server";

type RouteContext<P> = { params: Promise<P> };

/** Invoca un route handler App Router con una NextRequest costruita nel test. */
export async function callRoute<P extends Record<string, string>>(
  handler: (request: NextRequest, context: RouteContext<P>) => Promise<Response> | Response,
  options: {
    method?: string;
    url: string;
    body?: unknown;
    cookie?: string;
    params?: P;
  }
): Promise<Response> {
  const headers = new Headers();
  if (options.cookie) {
    headers.set("cookie", options.cookie);
  }

  let body: string | undefined;
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
    body = typeof options.body === "string" ? options.body : JSON.stringify(options.body);
  }

  const request = new NextRequest(new URL(options.url, "http://localhost:3000"), {
    method: options.method ?? "GET",
    headers,
    body,
  });

  return handler(request, { params: Promise.resolve((options.params ?? {}) as P) });
}
