// @ts-nocheck — Deno-only entry; Next's typecheck doesn't understand jsr: imports
import { serveDir } from "jsr:@std/http/file-server";

Deno.serve((req) => serveDir(req, { fsRoot: "out" }));
