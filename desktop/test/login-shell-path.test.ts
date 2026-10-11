import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLoginShellProbeCommand, defaultFallbackDirs, extractMarkedPath, mergePath, resolveLoginShellPath } from "../src/login-shell-path.ts";

test("extractMarkedPath pulls the text between two marker occurrences, ignoring rc-file noise outside them", () => {
  const marker = "__HERDR_BOT_PATH_abc123__";
  const output = `Last login: Tue Oct  7\nneofetch banner\n${marker}/usr/bin:/bin\n${marker}\nLogout\n`;
  assert.equal(extractMarkedPath(output, marker), "/usr/bin:/bin");
});

test("extractMarkedPath returns null when a marker is missing or the captured text is blank", () => {
  const marker = "__HERDR_BOT_PATH_abc123__";
  assert.equal(extractMarkedPath("no markers here", marker), null);
  assert.equal(extractMarkedPath(`${marker}only one marker`, marker), null);
  assert.equal(extractMarkedPath(`${marker}   \n${marker}`, marker), null);
});

test("buildLoginShellProbeCommand wraps printenv PATH with printf markers so noise outside them can be discarded", () => {
  const command = buildLoginShellProbeCommand("__MARK__");
  assert.equal(command, "printf '%s' '__MARK__'; /usr/bin/printenv PATH; printf '%s' '__MARK__'");
});

test("mergePath prepends the login shell's PATH entries (deduped) ahead of the existing minimal PATH", () => {
  const current = "/usr/bin:/bin:/usr/sbin:/sbin";
  const login = "/opt/homebrew/bin:/usr/bin:/usr/local/bin";
  assert.equal(mergePath(current, login, []), "/opt/homebrew/bin:/usr/bin:/usr/local/bin:/bin:/usr/sbin:/sbin");
});

test("mergePath dedupes repeats within the login PATH itself, keeping the first occurrence", () => {
  assert.equal(mergePath("/usr/bin", "/opt/homebrew/bin:/opt/homebrew/bin:/usr/bin", []), "/opt/homebrew/bin:/usr/bin");
});

test("mergePath falls back to the supplied fallback dirs (also prepended, deduped) when the login shell probe failed", () => {
  const current = "/usr/bin:/bin";
  const fallbacks = ["/opt/homebrew/bin", "/usr/local/bin", "/Users/ray/.local/bin"];
  assert.equal(mergePath(current, null, fallbacks), "/opt/homebrew/bin:/usr/local/bin:/Users/ray/.local/bin:/usr/bin:/bin");
});

test("mergePath ignores empty PATH segments so it never produces a leading/trailing/double colon", () => {
  assert.equal(mergePath("/usr/bin::/bin:", "/opt/homebrew/bin:", []), "/opt/homebrew/bin:/usr/bin:/bin");
});

test("defaultFallbackDirs anchors the user-local bin dir under the given home", () => {
  assert.deepEqual(defaultFallbackDirs("/Users/ray"), ["/opt/homebrew/bin", "/usr/local/bin", "/Users/ray/.local/bin"]);
});

test("resolveLoginShellPath extracts the PATH from the injected shell runner's output", async () => {
  const fakeExec = async (shellPath: string, command: string): Promise<string> => {
    assert.equal(shellPath, "/bin/custom-shell");
    const marker = command.match(/__HERDR_BOT_PATH_[0-9a-f]+__/)?.[0];
    assert.ok(marker != null);
    return `noise\n${marker}/opt/homebrew/bin:/usr/bin\n${marker}\n`;
  };
  const result = await resolveLoginShellPath({ SHELL: "/bin/custom-shell" }, fakeExec, 3000);
  assert.equal(result, "/opt/homebrew/bin:/usr/bin");
});

test("resolveLoginShellPath falls back to null silently when the shell runner rejects (timeout, missing shell, ...)", async () => {
  const fakeExec = async (): Promise<string> => { throw new Error("timed out"); };
  const result = await resolveLoginShellPath({ SHELL: "/bin/zsh" }, fakeExec, 3000);
  assert.equal(result, null);
});

test("resolveLoginShellPath defaults to /bin/zsh when SHELL is unset", async () => {
  const fakeExec = async (shellPath: string): Promise<string> => {
    assert.equal(shellPath, "/bin/zsh");
    return "";
  };
  await resolveLoginShellPath({}, fakeExec, 3000);
});
