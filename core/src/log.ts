export type LogSink = (line: string) => void;

let sink: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};

export function setLogSink(next: LogSink): void {
  sink = next;
}

export function log(scope: string, message: string, data?: unknown): void {
  const stamp = new Date().toISOString();
  const suffix = data === undefined ? "" : ` ${JSON.stringify(data)}`;
  sink(`${stamp} [herdr-bot:${scope}] ${message}${suffix}`);
}
