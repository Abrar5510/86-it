// ensure-video-decls.mjs — restore the six approved frame-video declarations.
//
// assemble-index.mjs HOISTS every `<video data-frame-video="approved">` out of its
// frame into index.html and replaces it in the frame with a comment — a persistent
// on-disk mutation. A second assembly therefore finds no declaration in the frames
// and silently builds an index.html WITHOUT the footage (this happened once already:
// the demo rendered as pure graphics). Run this immediately before every
// assemble-index invocation: if a frame carries neither the declaration nor the
// hoist comment it fails loudly; if only the comment remains, the declaration is
// put back in its place.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(ROOT, "..");
const COMMENT = "<!-- approved frame video hoisted by assemble-index -->";

const DECLS = [
  { frame: "03-fire.html", dur: "5.172", src: "assets/demo-fire-12.mp4" },
  { frame: "04-86-salmon.html", dur: "8.751", src: "assets/demo-86-salmon.mp4" },
  { frame: "05-status.html", dur: "5.381", src: "assets/demo-status-7.mp4" },
  { frame: "06-chatter.html", dur: "6.792", src: "assets/demo-chatter.mp4" },
  { frame: "07-bargein.html", dur: "4.78", src: "assets/demo-bargein.mp4" },
  { frame: "08-alert.html", dur: "5.721", src: "assets/demo-alert.mp4" },
  { frame: "09-live-raw.html", dur: "51", src: "assets/demo-live.mp4" },
];

const decl = (d) =>
  `<video data-frame-video="approved" data-start="0" data-duration="${d.dur}" ` +
  `data-track-index="1" data-frame-video-x="0" data-frame-video-y="0" ` +
  `data-frame-video-width="1920" data-frame-video-height="1080" ` +
  `data-frame-video-fit="cover" src="${d.src}" preload="auto" muted playsinline></video>`;

let present = 0;
let restored = 0;
let failed = false;

for (const d of DECLS) {
  const file = path.join(PROJECT, "compositions", "frames", d.frame);
  if (!fs.existsSync(file)) {
    console.error(`✗ ${d.frame}: file not found`);
    failed = true;
    continue;
  }
  const html = fs.readFileSync(file, "utf8");
  if (html.includes('data-frame-video="approved"')) {
    present += 1;
    continue;
  }
  const idx = html.indexOf(COMMENT);
  if (idx < 0) {
    console.error(`✗ ${d.frame}: neither a video declaration nor the hoist comment found`);
    failed = true;
    continue;
  }
  fs.writeFileSync(file, html.slice(0, idx) + decl(d) + html.slice(idx + COMMENT.length));
  restored += 1;
}

console.log(`video decls: ${present} present, ${restored} restored`);
if (failed) process.exit(1);
