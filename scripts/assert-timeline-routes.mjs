/**
 * Regression guard: Mentions/Home must not use operator-only or "@me" recent search.
 * Run: node scripts/assert-timeline-routes.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(root, "worker/x.ts"), "utf8");

// Strip line + block comments before scanning for banned call patterns.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const bannedLiterals = [
  ['"@me -is:retweet"', 'Mentions must not query "@me -is:retweet"'],
  ["'@me -is:retweet'", "Mentions must not query '@me -is:retweet'"],
  ['"lang:en -is:retweet"', "Home must not use operator-only recent search"],
];

for (const [needle, msg] of bannedLiterals) {
  if (code.includes(needle)) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

const required = [
  "/timelines/reverse_chronological",
  "/users/${userId}/mentions?",
  "isPlaceholderListId",
];

for (const needle of required) {
  if (!src.includes(needle)) {
    console.error(`FAIL: missing required route/helper: ${needle}`);
    process.exit(1);
  }
}

const mentionsMatch = code.match(
  /if\s*\(\s*kind\s*===\s*"mentions"\s*\)\s*\{([\s\S]*?)\n\s*\}/,
);
if (!mentionsMatch) {
  console.error("FAIL: could not locate mentions branch");
  process.exit(1);
}
const mentionsBody = mentionsMatch[1];
if (!mentionsBody.includes("/mentions?")) {
  console.error("FAIL: mentions branch missing /users/:id/mentions");
  process.exit(1);
}
if (/\brecentSearch\s*\(/.test(mentionsBody)) {
  console.error("FAIL: mentions branch still calls recentSearch(");
  process.exit(1);
}

const homeMatch = code.match(
  /if\s*\(\s*kind\s*===\s*"home"\s*\)\s*\{([\s\S]*?)\n\s*\}/,
);
if (!homeMatch?.[1]?.includes("reverse_chronological")) {
  console.error("FAIL: home branch missing reverse_chronological");
  process.exit(1);
}
if (/\brecentSearch\s*\(/.test(homeMatch[1])) {
  console.error("FAIL: home branch still calls recentSearch(");
  process.exit(1);
}

console.log(
  "ok: timeline routes — mentions=/users/:id/mentions, home=reverse_chronological",
);
