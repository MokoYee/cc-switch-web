import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const WEB_DIST_DIR = resolve(process.cwd(), "apps/web/dist");

const contentTypeByExt: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

export const readUiAsset = async (relativePath: string): Promise<{
  readonly body: Buffer | string;
  readonly contentType: string;
}> => {
  const normalizedPath = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = join(WEB_DIST_DIR, normalizedPath);
  const body = await readFile(absolutePath);

  return {
    body,
    contentType: contentTypeByExt[extname(absolutePath)] ?? "application/octet-stream"
  };
};

export const readUiIndex = async (): Promise<string> =>
  readFile(join(WEB_DIST_DIR, "index.html"), "utf-8");
