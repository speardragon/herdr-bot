#!/usr/bin/env node
// Writes stand-in files for the hashed runtime assets the upstream renderer expects next to its bundle.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const out = resolve(new URL("../renderer/public/assets", import.meta.url).pathname);
mkdirSync(out, { recursive: true });
const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const SVG_EMPTY = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const names = [
  "app-icon-C7NKj2u7.png", "apollo-B0sEgAUH.png", "ashby-BidvOSTU.png", "box-DrJB_xON.png", "calendly-DYRMkyLM.svg", "canva-djBDOrSx.svg",
  "clay-CXmF7QZG.png", "databricks-NEF0SRYx.png", "demo-computer-wallpaper-BO7Ye4dV.jpg", "mailchimp-AFHOmIeb.svg", "nooks-Da6AC940.png",
  "quickbooks-N88wePET.png", "rippling-cz7o1jpc.png", "salesforce-DuGcPENR.svg", "snowflake-B53K53W6.png", "tableau-DMgl1MR0.png",
  "workday-DI2a8j1o.svg", "zoominfo-kXQt8h27.png",
];
for (const name of names) {
  writeFileSync(join(out, name), name.endsWith(".svg") ? SVG_EMPTY : PNG_1X1);
}
process.stdout.write(`wrote ${names.length} placeholder assets to ${out}\n`);
