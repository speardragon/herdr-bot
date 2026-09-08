import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const VOICE_MAX_RECORDING_MS = 300_000;
export const VOICE_MIN_RECORDING_MS = 500;
export const VOICE_RECORDER_TIMESLICE_MS = 1_000;

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/mp4;codecs=mp4a.40.2"
] as const;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

export type VoiceErrorCode =
  | "MICROPHONE_PERMISSION_DENIED"
  | "AUDIO_DEVICE_UNAVAILABLE"
  | "NETWORK_CONNECTION_FAILED"
  | "RECORDING_ERROR"
  | "UNKNOWN";

export interface VoiceSessionError {
  code: VoiceErrorCode;
  message: string;
  recoverable: boolean;
}

export type VoiceSessionStatus = "idle" | "requesting_permission" | "recording" | "processing" | "error";

export interface VoiceSessionState {
  status: VoiceSessionStatus;
  error?: VoiceSessionError;
}

export interface VoiceTranscriptionResult {
  text: string;
}

export type VoiceTranscriber = (audio: Uint8Array, mimeType: string, language?: string) => Promise<VoiceTranscriptionResult>;

export interface VoiceRecordingCeiling {
  dispose(): void;
}

export interface VoiceRecordingCeilingFactory {
  arm(name: string, onExpired: () => void): VoiceRecordingCeiling;
}

export interface VoiceSessionControllerOptions {
  transcribe?: VoiceTranscriber;
  language?: string;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
  recorderConstructor?: VoiceRecorderConstructor;
  now?: () => number;
  recordingCeiling?: VoiceRecordingCeilingFactory | null;
}

interface VoiceRecorder {
  readonly state: RecordingState;
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onerror: (() => void) | null;
  onstop: (() => void) | null;
  start(timeslice?: number): void;
  stop(): void;
}

interface VoiceRecorderConstructor {
  new (stream: MediaStream, options?: { mimeType: string }): VoiceRecorder;
  isTypeSupported?(mimeType: string): boolean;
}

interface ActiveRecording {
  recorder: VoiceRecorder;
  stream: MediaStream;
  chunks: Blob[];
  startedAtMs: number;
  ceiling: VoiceRecordingCeiling | null;
}

const IDLE_STATE: VoiceSessionState = { status: "idle" };
const DEFAULT_ERROR_MESSAGES: Record<VoiceErrorCode, string> = {
  MICROPHONE_PERMISSION_DENIED: "Microphone access denied. Please enable microphone permissions in your system settings.",
  AUDIO_DEVICE_UNAVAILABLE: "No microphone found. Please connect a microphone and try again.",
  NETWORK_CONNECTION_FAILED: "Network connection failed. Please check your internet connection.",
  RECORDING_ERROR: "Recording interrupted. Please try again.",
  UNKNOWN: "An error occurred with voice input. Please try again."
};

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function errorCode(error: Error): VoiceErrorCode {
  if (error.name === "NotAllowedError") return "MICROPHONE_PERMISSION_DENIED";
  if (error.name === "NotFoundError") return "AUDIO_DEVICE_UNAVAILABLE";
  if (error.name === "AbortError" || error.name === "TimeoutError") return "NETWORK_CONNECTION_FAILED";
  return "UNKNOWN";
}

function errorMessage(error: Error): string {
  return DEFAULT_ERROR_MESSAGES[errorCode(error)];
}

function browserMediaDevices(): Pick<MediaDevices, "getUserMedia"> | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
}

function browserRecorderConstructor(): VoiceRecorderConstructor | undefined {
  return (globalThis as typeof globalThis & { MediaRecorder?: VoiceRecorderConstructor }).MediaRecorder;
}

function preferredMimeType(recorderConstructor: VoiceRecorderConstructor | undefined): string | undefined {
  for (const mimeType of RECORDER_MIME_TYPES) {
    if (recorderConstructor?.isTypeSupported?.(mimeType) === true) return mimeType;
  }
  return undefined;
}

function defaultRecordingCeiling(): VoiceRecordingCeilingFactory {
  return {
    arm(_name, onExpired) {
      const timer = setTimeout(onExpired, VOICE_MAX_RECORDING_MS);
      return { dispose: () => clearTimeout(timer) };
    }
  };
}

export class VoiceSessionController {
  private state: VoiceSessionState = IDLE_STATE;
  private readonly stateListeners = new Set<(state: VoiceSessionState) => void>();
  private readonly finalListeners = new Set<(text: string) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private startRequestId = 0;
  private activeRecording: ActiveRecording | undefined;
  private stopInFlightFor: ActiveRecording | null = null;
  private abortController: AbortController | undefined;
  private readonly transcribe: VoiceTranscriber;
  private readonly language: string | undefined;
  private readonly mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined;
  private readonly recorderConstructor: VoiceRecorderConstructor | undefined;
  private readonly now: () => number;
  private readonly recordingCeiling: VoiceRecordingCeilingFactory | null;

  constructor(options: VoiceSessionControllerOptions = {}) {
    this.transcribe = options.transcribe ?? (() => Promise.reject(new Error("Voice transcription source is unavailable.")));
    this.language = options.language;
    this.mediaDevices = options.mediaDevices ?? browserMediaDevices();
    this.recorderConstructor = options.recorderConstructor ?? browserRecorderConstructor();
    this.now = options.now ?? Date.now;
    this.recordingCeiling = options.recordingCeiling === undefined ? defaultRecordingCeiling() : options.recordingCeiling;
  }

  getState(): VoiceSessionState {
    return this.state;
  }

  getMediaStream(): MediaStream | undefined {
    return this.activeRecording?.stream;
  }

  onStateChanged(listener: (state: VoiceSessionState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onFinal(listener: (text: string) => void): () => void {
    this.finalListeners.add(listener);
    return () => this.finalListeners.delete(listener);
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.state.status !== "idle" && this.state.status !== "error") return;
    const requestId = ++this.startRequestId;
    this.setState({ status: "requesting_permission", error: undefined });
    try {
      if (this.mediaDevices == null) throw new Error("Microphone access is unavailable.");
      const stream = await this.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      if (requestId !== this.startRequestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.startRecording(stream);
    } catch (reason) {
      if (requestId !== this.startRequestId) return;
      const error = asError(reason);
      const recoverable = error.name !== "NotAllowedError";
      this.handleError(error, recoverable);
    }
  }

  async stop(): Promise<void> {
    if (this.state.status === "requesting_permission") {
      this.startRequestId += 1;
      this.setState({ status: "idle", error: undefined });
      return;
    }
    if (this.state.status === "recording") await this.stopRecording();
  }

  cancel(): void {
    this.startRequestId += 1;
    this.cancelRecording();
  }

  private startRecording(stream: MediaStream): void {
    if (this.recorderConstructor == null) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("MediaRecorder is unavailable.");
    }
    const mimeType = preferredMimeType(this.recorderConstructor);
    let recorder: VoiceRecorder;
    try {
      recorder = mimeType == null
        ? new this.recorderConstructor(stream)
        : new this.recorderConstructor(stream, { mimeType });
    } catch (reason) {
      stream.getTracks().forEach((track) => track.stop());
      throw reason;
    }

    const active: ActiveRecording = { recorder, stream, chunks: [], startedAtMs: this.now(), ceiling: null };
    this.activeRecording = active;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) active.chunks.push(event.data);
    };
    recorder.onerror = () => {
      if (this.activeRecording !== active) return;
      this.cleanupRecorder();
      this.setState({ status: "error", error: { code: "RECORDING_ERROR", message: "Recording interrupted. Please try again.", recoverable: true } });
    };
    try {
      recorder.start(VOICE_RECORDER_TIMESLICE_MS);
      active.ceiling = this.recordingCeiling?.arm("recording", () => { void this.stop(); }) ?? null;
    } catch (reason) {
      this.releaseActiveRecording();
      throw reason;
    }
    this.setState({ status: "recording", error: undefined });
  }

  private async stopRecording(): Promise<void> {
    const active = this.activeRecording;
    if (active == null || active.recorder.state === "inactive" || this.stopInFlightFor === active) return;
    this.stopInFlightFor = active;
    active.ceiling?.dispose();
    active.ceiling = null;
    const recorder = active.recorder;
    const mimeType = recorder.mimeType || active.chunks[0]?.type || "audio/webm";
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    if (this.activeRecording !== active) {
      if (this.stopInFlightFor === active) this.stopInFlightFor = null;
      return;
    }
    this.activeRecording = undefined;
    active.stream.getTracks().forEach((track) => track.stop());
    const blob = new Blob(active.chunks, { type: mimeType });
    const tooShort = this.now() - active.startedAtMs < VOICE_MIN_RECORDING_MS;
    if (blob.size === 0 || tooShort) {
      this.stopInFlightFor = null;
      this.setState({ status: "idle", error: undefined });
      return;
    }
    this.setState({ status: "processing", error: undefined });
    const abortController = new AbortController();
    this.abortController = abortController;
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const { text } = await this.transcribe(bytes, mimeType, this.language);
      if (abortController.signal.aborted) return;
      const trimmed = text.trim();
      if (trimmed.length > 0) this.emitFinal(trimmed);
      this.setState({ status: "idle", error: undefined });
    } catch (reason) {
      if (abortController.signal.aborted) return;
      const error = asError(reason);
      this.setState({ status: "error", error: { code: errorCode(error), message: errorMessage(error), recoverable: true } });
      this.emitError(error);
    } finally {
      if (this.abortController === abortController) this.abortController = undefined;
      if (this.stopInFlightFor === active) this.stopInFlightFor = null;
    }
  }

  private cancelRecording(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.stopInFlightFor = null;
    this.releaseActiveRecording();
    this.setState({ status: "idle", error: undefined });
  }

  private cleanupRecorder(): void {
    this.abortController?.abort();
    this.abortController = undefined;
    this.stopInFlightFor = null;
    this.releaseActiveRecording();
  }

  private releaseActiveRecording(): void {
    const active = this.activeRecording;
    if (active == null) return;
    this.activeRecording = undefined;
    active.ceiling?.dispose();
    active.ceiling = null;
    const recorder = active.recorder;
    if (recorder.state !== "inactive") {
      recorder.ondataavailable = null;
      recorder.onerror = null;
      recorder.stop();
    }
    active.stream.getTracks().forEach((track) => track.stop());
  }

  private handleError(error: Error, recoverable: boolean): void {
    this.setState({ status: "error", error: { code: errorCode(error), message: errorMessage(error), recoverable } });
    this.emitError(error);
    if (!recoverable) this.cleanupRecorder();
  }

  private setState(next: VoiceSessionState): void {
    this.state = next;
    for (const listener of this.stateListeners) listener(this.state);
  }

  private emitFinal(text: string): void {
    for (const listener of this.finalListeners) listener(text);
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }

  dispose(): void {
    this.startRequestId += 1;
    this.cleanupRecorder();
    this.stateListeners.clear();
    this.finalListeners.clear();
    this.errorListeners.clear();
  }
}

export interface VoiceSessionSnapshot {
  state: VoiceSessionState;
  seconds: number;
}

export function useVoiceSession(options: VoiceSessionControllerOptions, scopeKey = "") {
  // The composer owns this account/agent fence. Replacing the controller lets
  // the hook cleanup abort a pending permission/transcription before a newly
  // selected agent can observe the old session.
  const controller = useMemo(() => new VoiceSessionController(options), [options, scopeKey]);
  const [snapshot, setSnapshot] = useState<VoiceSessionSnapshot>({ state: controller.getState(), seconds: 0 });
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    const publish = () => {
      const state = controller.getState();
      setSnapshot({ state, seconds: startTime.current == null ? 0 : Math.floor((Date.now() - startTime.current) / 1_000) });
    };
    const stopState = controller.onStateChanged((state) => {
      if (state.status === "recording") startTime.current = Date.now();
      else startTime.current = null;
      publish();
    });
    publish();
    let timer: ReturnType<typeof setInterval> | undefined;
    const refreshTimer = () => {
      if (controller.getState().status === "recording" && timer === undefined) {
        timer = setInterval(publish, 250);
      } else if (controller.getState().status !== "recording" && timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    };
    refreshTimer();
    const stopRefresh = controller.onStateChanged(refreshTimer);
    return () => {
      stopRefresh();
      stopState();
      if (timer !== undefined) clearInterval(timer);
      if (controller.getState().status !== "idle") controller.cancel();
      controller.dispose();
    };
  }, [controller]);

  const start = useCallback(() => { void controller.start(); }, [controller]);
  const stop = useCallback(() => { void controller.stop(); }, [controller]);
  const cancel = useCallback(() => controller.cancel(), [controller]);
  const dismissError = useCallback(() => {
    if (controller.getState().status === "error") controller.cancel();
  }, [controller]);
  const status = snapshot.state.status;
  return {
    controller,
    isRecording: status === "recording",
    isProcessing: status === "processing",
    isActivating: status === "requesting_permission",
    stream: status === "recording" ? controller.getMediaStream() : undefined,
    recordingDuration: `${Math.floor(snapshot.seconds / 60)}:${String(snapshot.seconds % 60).padStart(2, "0")}`,
    error: status === "error" ? snapshot.state.error : undefined,
    handleMicClick: start,
    handleStopClick: stop,
    handleCancelClick: cancel,
    dismissError
  };
}

export function VoiceWaveform({ stream }: { stream?: MediaStream }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas == null) return;
    const context = canvas.getContext("2d");
    if (context == null) return;
    const drawStatic = () => {
      const width = Math.max(1, canvas.clientWidth * (globalThis.devicePixelRatio || 1));
      const height = Math.max(1, canvas.clientHeight * (globalThis.devicePixelRatio || 1));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "currentColor";
      const count = Math.max(1, Math.floor(width / 4));
      for (let index = 0; index < count; index += 1) {
        const barHeight = height * (0.35 + ((index * 17) % 47) / 100);
        context.fillRect(index * 4, (height - barHeight) / 2, 2, barHeight);
      }
    };
    if (stream == null) {
      drawStatic();
      return;
    }
    const AudioContextConstructor = (globalThis as typeof globalThis & { AudioContext?: typeof AudioContext }).AudioContext;
    if (AudioContextConstructor == null) {
      drawStatic();
      return;
    }
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    const values = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    const draw = () => {
      const width = Math.max(1, canvas.clientWidth * (globalThis.devicePixelRatio || 1));
      const height = Math.max(1, canvas.clientHeight * (globalThis.devicePixelRatio || 1));
      canvas.width = width;
      canvas.height = height;
      analyser.getByteFrequencyData(values);
      context.clearRect(0, 0, width, height);
      context.fillStyle = "currentColor";
      const count = Math.max(1, Math.floor(width / 4));
      for (let index = 0; index < count; index += 1) {
        const value = values[Math.min(values.length - 1, Math.floor(index * values.length / count))] ?? 0;
        const barHeight = Math.max(height * 0.25, height * value / 255);
        context.fillRect(index * 4, (height - barHeight) / 2, 2, barHeight);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      analyser.disconnect();
      void audioContext.close();
    };
  }, [stream]);

  return <canvas aria-hidden="true" className="sand-recording-chip__waveform" ref={canvasRef} />;
}
