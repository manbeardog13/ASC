// Pure check of the Nero-hosted config switch (no network, no browser).
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { buildConfig, config, NERO } = await import(pathToFileURL(path.join(root, "js/config.js")).href);
assert.equal(config.HOST_MODE, "direct", "shipped default must stay direct");
assert.match(config.SUPABASE_URL, /^https:\/\/ilnqhlrvchuvpjgptjfx\.supabase\.co$/);
const n = buildConfig("nero", "https://app.nerosummit.com/ASC/js/config.js");
assert.equal(n.SUPABASE_URL, "https://app.nerosummit.com/ASC/api");
assert.equal(n.SUPABASE_ANON_KEY, NERO.ANON_KEY);
assert.equal(n.STORAGE_KEY, "sb-ryueshiunqobrluuuhyp-auth-token");
assert.equal(buildConfig("other", "https://x/ASC/js/config.js").HOST_MODE, "direct");
console.log("host-mode: ok");
