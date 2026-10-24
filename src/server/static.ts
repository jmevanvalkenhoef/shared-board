// Serves the web page. TypeScript files are sent to the browser with their
// types stripped, so the page and the server share src/domain without a build.

import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { extname, join, normalize, sep } from "node:path";
import type { ServerResponse } from "node:http";

const PUBLIC_DIRS = ["web", join("src", "domain")];

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
};

/** Returns false when the path is not a public file. */
export async function serveStatic(root: string, pathname: string, res: ServerResponse): Promise<boolean> {
  const relative = normalize(decodeURIComponent(pathname === "/" ? "/web/index.html" : pathname)).slice(1);
  const type = TYPES[extname(relative)];
  if (!type || !PUBLIC_DIRS.some((dir) => relative.startsWith(dir + sep))) return false;

  let body: Buffer | string;
  try {
    body = await readFile(join(root, relative));
  } catch {
    return false;
  }
  if (relative.endsWith(".ts")) body = stripTypeScriptTypes(body.toString("utf8"));

  res.writeHead(200, { "content-type": type, "cache-control": "no-cache" });
  res.end(body);
  return true;
}
