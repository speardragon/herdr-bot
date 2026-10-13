/**
 * Installing an update from inside the app, without a code-signing certificate. Electron's own updater
 * (Squirrel.Mac) needs the new build signed by the same certificate as the running one, so instead the
 * app downloads the release's zip itself, checks it against the release's SHA256SUMS.txt, unpacks it
 * with ditto, and hands a small shell script the swap: once this process has exited, the script moves
 * the running bundle aside, moves the new one into its place (putting the old one back if that fails)
 * and opens it. A file the app downloads itself carries no quarantine flag, so macOS opens the new
 * version without the "unidentified developer" prompt.
 *
 * The naming, parsing and script are pure; `downloadVerified`, `unpackApp` and `startSwap` do the I/O.
 */
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, constants, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { basename, dirname, join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export interface ReleaseAsset {
  readonly name: string;
  readonly url: string;
}

/** The release files the in-app updater uses: `herdr-bot-<version>-<arch>.zip`, and the checksums. */
export function updateAssetNames(version: string, arch: string): { readonly archive: string; readonly sums: string } {
  return { archive: `herdr-bot-${version}-${arch}.zip`, sums: "SHA256SUMS.txt" };
}

export function findAsset(assets: readonly ReleaseAsset[], name: string): ReleaseAsset | null {
  return assets.find((asset) => asset.name === name) ?? null;
}

/** `shasum -a 256` output ("<hex>  <name>", or "<hex> *<name>" in binary mode) as name -> lowercase hex. */
export function parseSha256Sums(text: string): ReadonlyMap<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (match?.[1] != null && match[2] != null) sums.set(match[2].trim(), match[1].toLowerCase());
  }
  return sums;
}

/** The `.app` bundle an executable at `<bundle>.app/Contents/MacOS/<name>` belongs to, or null for any other layout. */
export function bundlePathFromExe(exePath: string): string | null {
  const macos = dirname(exePath);
  const contents = dirname(macos);
  const bundle = dirname(contents);
  if (basename(macos) !== "MacOS" || basename(contents) !== "Contents" || !bundle.endsWith(".app")) return null;
  return bundle;
}

function shellQuote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}

export interface SwapPlan {
  /** The process that must exit before the bundle can be replaced. */
  readonly pid: number;
  /** The running bundle, e.g. /Applications/herdr-bot.app. */
  readonly target: string;
  /** The verified, unpacked new bundle. */
  readonly staged: string;
  /** Where the running bundle is parked during the swap, next to it so the move is a rename. */
  readonly backup: string;
  /** Scratch directory removed at the end. */
  readonly workDir: string;
  readonly logFile: string;
}

/**
 * The swap script. It waits up to a minute for the app to exit; if it never does, nothing is touched.
 * The new bundle goes in only after the old one is safely parked, and the old one is put back when the
 * move fails, so a failed update still leaves a working app to open.
 */
export function swapScript(plan: SwapPlan): string {
  const q = {
    target: shellQuote(plan.target),
    staged: shellQuote(plan.staged),
    backup: shellQuote(plan.backup),
    workDir: shellQuote(plan.workDir),
    log: shellQuote(plan.logFile),
  };
  return [
    "#!/bin/sh",
    `exec >>${q.log} 2>&1`,
    `echo "[$(date)] herdr-bot update: waiting for pid ${plan.pid}"`,
    "tries=0",
    `while kill -0 ${plan.pid} 2>/dev/null; do`,
    "  tries=$((tries + 1))",
    `  if [ "$tries" -gt 300 ]; then echo "the app did not quit; update abandoned"; rm -rf ${q.workDir}; exit 1; fi`,
    "  sleep 0.2",
    "done",
    `rm -rf ${q.backup}`,
    `if mv ${q.target} ${q.backup}; then`,
    `  if mv ${q.staged} ${q.target}; then`,
    `    rm -rf ${q.backup}`,
    '    echo "installed"',
    "  else",
    `    mv ${q.backup} ${q.target}`,
    '    echo "could not move the new version into place; kept the old one"',
    "  fi",
    "else",
    '  echo "could not move the running version aside; nothing changed"',
    "fi",
    `rm -rf ${q.workDir}`,
    `open ${q.target}`,
    "",
  ].join("\n");
}

/** Whether this process can replace its own bundle: it must run from a packaged `.app` in a folder it can write to. */
export async function selfUpdateTarget(isPackaged: boolean, exePath: string): Promise<string | null> {
  if (!isPackaged || process.platform !== "darwin") return null;
  const bundle = bundlePathFromExe(exePath);
  if (bundle == null) return null;
  try {
    await access(dirname(bundle), constants.W_OK);
    await access(bundle, constants.W_OK);
    return bundle;
  } catch {
    return null;
  }
}

export async function makeWorkDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "herdr-bot-update-"));
}

/** GETs `url`, following up to five redirects (GitHub sends release downloads to its file host). */
function get(url: string, redirects = 5): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, { headers: { "user-agent": "herdr-bot-updater" }, timeout: 60_000 }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location != null) {
        response.resume();
        if (redirects === 0) reject(new Error("too many redirects"));
        else resolve(get(new URL(location, url).href, redirects - 1));
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`download failed: HTTP ${status}`));
        return;
      }
      resolve(response);
    });
    request.on("timeout", () => request.destroy(new Error("download timed out")));
    request.on("error", reject);
  });
}

/** The body of `url` as text (the checksums file). */
export async function fetchText(url: string): Promise<string> {
  const response = await get(url);
  const chunks: Buffer[] = [];
  for await (const chunk of response) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Streams `url` to `dest`, hashing as it goes, and rejects unless the SHA-256 equals `expectedSha256`.
 * `onProgress` gets a 0..1 fraction when the server sends a length. Uses node:https rather than
 * fetch: fetch's stream can trip an internal assertion and take the whole process down when the
 * server closes the connection while the file write is applying backpressure.
 */
export async function downloadVerified(url: string, dest: string, expectedSha256: string, onProgress: (fraction: number) => void): Promise<void> {
  const response = await get(url);
  const total = Number(response.headers["content-length"] ?? 0);
  const hash = createHash("sha256");
  let received = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk);
      received += chunk.byteLength;
      if (total > 0) onProgress(Math.min(1, received / total));
      callback(null, chunk);
    },
  });
  await pipeline(response, meter, createWriteStream(dest));
  if (hash.digest("hex") !== expectedSha256.toLowerCase()) throw new Error("the downloaded update does not match its published checksum");
}

function run(file: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(file, [...args], { timeout: 5 * 60_000 }, (error, _stdout, stderr) => {
      if (error == null) resolve();
      else reject(new Error(`${basename(file)} failed: ${stderr.trim() || error.message}`));
    });
  });
}

/**
 * Unpacks the zip with ditto (which keeps the symlinks inside Electron's frameworks; a JS unzip would
 * break them) and returns the one `.app` inside.
 */
export async function unpackApp(zipPath: string, outDir: string): Promise<string> {
  await run("/usr/bin/ditto", ["-x", "-k", zipPath, outDir]);
  const apps = (await readdir(outDir)).filter((name) => name.endsWith(".app"));
  if (apps.length !== 1 || apps[0] == null) throw new Error("the update archive does not contain exactly one app");
  return join(outDir, apps[0]);
}

/** Writes the swap script and starts it detached, so it outlives this process. The caller then quits the app. */
export async function startSwap(plan: SwapPlan): Promise<void> {
  const scriptPath = join(plan.workDir, "swap.sh");
  await writeFile(scriptPath, swapScript(plan), { mode: 0o755 });
  const child = spawn("/bin/sh", [scriptPath], { detached: true, stdio: "ignore" });
  child.unref();
}

/** What the desktop bridge needs to install an update; `createUpdater` is the real one, tests pass fakes. */
export interface Updater {
  /** The bundle to replace, or null when this build cannot update itself (a source run, an unwritable folder). */
  target(): Promise<string | null>;
  /** Downloads, verifies and unpacks `version`, then starts the swap. Resolves once the app may quit. */
  install(args: { readonly version: string; readonly assets: readonly ReleaseAsset[]; readonly target: string; readonly onProgress: (fraction: number) => void }): Promise<void>;
  quit(): void;
}

export interface UpdaterOptions {
  readonly isPackaged: boolean;
  readonly exePath: string;
  readonly arch: string;
  readonly pid: number;
  readonly logFile: string;
  readonly quit: () => void;
}

export function createUpdater(options: UpdaterOptions): Updater {
  return {
    target: () => selfUpdateTarget(options.isPackaged, options.exePath),
    quit: options.quit,
    async install({ version, assets, target, onProgress }) {
      const names = updateAssetNames(version, options.arch);
      const archive = findAsset(assets, names.archive);
      const sumsAsset = findAsset(assets, names.sums);
      if (archive == null || sumsAsset == null) throw new Error(`release ${version} has no update archive for this Mac`);
      const expected = parseSha256Sums(await fetchText(sumsAsset.url)).get(names.archive);
      if (expected == null) throw new Error(`the release checksums do not list ${names.archive}`);
      const workDir = await makeWorkDir();
      try {
        const zipPath = join(workDir, names.archive);
        await downloadVerified(archive.url, zipPath, expected, onProgress);
        const outDir = join(workDir, "unpacked");
        await mkdir(outDir);
        const staged = await unpackApp(zipPath, outDir);
        await startSwap({ pid: options.pid, target, staged, backup: join(dirname(target), `.${basename(target)}.previous`), workDir, logFile: options.logFile });
      } catch (error) {
        await rm(workDir, { recursive: true, force: true });
        throw error;
      }
    },
  };
}
