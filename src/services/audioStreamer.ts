export interface AudioStreamerCallbacks {
  onAudioChunk: (base64Pcm16: string) => void;
  onPlaybackStateChange: (isPlaying: boolean) => void;
  onError?: (message: string) => void;
}

const WORKLET_CODE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(2048);
    this._offset = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const channel = input[0];

    for (let i = 0; i < channel.length; i++) {
      this._buffer[this._offset++] = channel[i];
      if (this._offset >= this._buffer.length) {
        this.port.postMessage(this._buffer.slice());
        this._offset = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-capture-processor", PcmCaptureProcessor);
`;

function downsampleFloat32(
  buffer: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.max(1, Math.round(buffer.length / ratio));
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const index0 = Math.floor(srcIndex);
    const index1 = Math.min(index0 + 1, buffer.length - 1);
    const frac = srcIndex - index0;
    result[i] = buffer[index0] * (1 - frac) + buffer[index1] * frac;
  }
  return result;
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(pcm16.buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToFloat32Pcm16(base64: string): Float32Array {
  const binary = atob(base64);
  const byteLength = binary.length;
  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(byteLength / 2);
  const float32 = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const int16 = view.getInt16(i * 2, true);
    float32[i] = int16 / 32768;
  }
  return float32;
}

export class AudioStreamer {
  private callbacks: AudioStreamerCallbacks;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private silentGain: GainNode | null = null;
  private outputGain: GainNode | null = null;
  private inputAnalyser: AnalyserNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private isPlaying = false;
  private micMuted = false;
  private speakerMuted = false;
  private disposed = false;

  constructor(callbacks: AudioStreamerCallbacks) {
    this.callbacks = callbacks;
  }

  public async prepare(): Promise<void> {
    this.disposed = false;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    this.inputCtx = new AudioCtx({ sampleRate: 16000 });
    this.outputCtx = new AudioCtx({ sampleRate: 24000 });

    if (this.inputCtx.state === "suspended") {
      await this.inputCtx.resume();
    }
    if (this.outputCtx.state === "suspended") {
      await this.outputCtx.resume();
    }

    this.outputAnalyser = this.outputCtx.createAnalyser();
    this.outputAnalyser.fftSize = 256;
    this.outputAnalyser.smoothingTimeConstant = 0.76;

    this.outputGain = this.outputCtx.createGain();
    this.outputGain.gain.value = this.speakerMuted ? 0 : 1;

    this.outputAnalyser.connect(this.outputGain);
    this.outputGain.connect(this.outputCtx.destination);

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
  }

  public async startCapture(): Promise<void> {
    if (this.disposed || !this.inputCtx || !this.mediaStream) return;

    this.sourceNode = this.inputCtx.createMediaStreamSource(this.mediaStream);
    this.inputAnalyser = this.inputCtx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.78;

    this.silentGain = this.inputCtx.createGain();
    this.silentGain.gain.value = 0;

    this.sourceNode.connect(this.inputAnalyser);

    const handleSamples = (rawSamples: Float32Array) => {
      if (this.disposed || this.micMuted || !this.inputCtx) return;
      const samples16k = downsampleFloat32(
        rawSamples,
        this.inputCtx.sampleRate,
        16000
      );
      const base64 = float32ToBase64Pcm16(samples16k);
      this.callbacks.onAudioChunk(base64);
    };

    let workletLoaded = false;
    if (typeof this.inputCtx.audioWorklet?.addModule === "function") {
      try {
        const blob = new Blob([WORKLET_CODE], {
          type: "application/javascript",
        });
        const workletUrl = URL.createObjectURL(blob);
        try {
          await this.inputCtx.audioWorklet.addModule(workletUrl);
        } finally {
          URL.revokeObjectURL(workletUrl);
        }
        if (this.disposed) return;

        this.workletNode = new AudioWorkletNode(
          this.inputCtx,
          "pcm-capture-processor"
        );
        this.workletNode.port.onmessage = (event: MessageEvent<Float32Array>) => {
          handleSamples(event.data);
        };
        this.inputAnalyser.connect(this.workletNode);
        this.workletNode.connect(this.silentGain);
        this.silentGain.connect(this.inputCtx.destination);
        workletLoaded = true;
      } catch {
        workletLoaded = false;
      }
    }

    if (!workletLoaded && !this.disposed) {
      this.scriptProcessor = this.inputCtx.createScriptProcessor(2048, 1, 1);
      this.scriptProcessor.onaudioprocess = (event) => {
        handleSamples(event.inputBuffer.getChannelData(0));
      };
      this.inputAnalyser.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.silentGain);
      this.silentGain.connect(this.inputCtx.destination);
    }
  }

  public enqueueAudio(base64Pcm16: string): void {
    if (
      this.disposed ||
      !this.outputCtx ||
      !this.outputAnalyser ||
      !base64Pcm16
    ) {
      return;
    }

    if (this.outputCtx.state === "suspended") {
      this.outputCtx.resume().catch(() => {});
    }

    const samples = base64ToFloat32Pcm16(base64Pcm16);
    if (samples.length === 0) return;

    const audioBuffer = this.outputCtx.createBuffer(1, samples.length, 24000);
    audioBuffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

    const source = this.outputCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.outputAnalyser);

    const now = this.outputCtx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now + 0.02;
    }

    const scheduledAt = this.nextStartTime;
    this.nextStartTime += audioBuffer.duration;

    this.activeSources.add(source);
    if (!this.isPlaying) {
      this.isPlaying = true;
      this.callbacks.onPlaybackStateChange(true);
    }

    source.onended = () => {
      this.activeSources.delete(source);
      if (this.activeSources.size === 0 && this.isPlaying) {
        this.isPlaying = false;
        this.nextStartTime = 0;
        this.callbacks.onPlaybackStateChange(false);
      }
    };

    source.start(scheduledAt);
  }

  public stopPlayback(): void {
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeSources.clear();
    this.nextStartTime = 0;
    if (this.isPlaying) {
      this.isPlaying = false;
      this.callbacks.onPlaybackStateChange(false);
    }
  }

  public setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  public setSpeakerMuted(muted: boolean): void {
    this.speakerMuted = muted;
    if (this.outputGain && this.outputCtx) {
      this.outputGain.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.outputCtx.currentTime,
        0.02
      );
    }
  }

  public getVisualizationLevel(
    channel: "input" | "output",
    bins?: Uint8Array<ArrayBuffer>
  ): number {
    const analyser =
      channel === "output" ? this.outputAnalyser : this.inputAnalyser;
    if (!analyser) return 0;

    if (channel === "input" && this.micMuted) {
      if (bins) bins.fill(0);
      return 0;
    }

    const buffer =
      bins ?? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    analyser.getByteFrequencyData(buffer);

    let sum = 0;
    const sampleCount = Math.min(buffer.length, 48);
    for (let i = 0; i < sampleCount; i++) {
      sum += buffer[i];
    }
    return Math.min(1, sum / (sampleCount * 155));
  }

  public getFrequencyBinCount(): number {
    return (
      this.outputAnalyser?.frequencyBinCount ??
      this.inputAnalyser?.frequencyBinCount ??
      128
    );
  }

  public dispose(): void {
    this.disposed = true;
    this.stopPlayback();

    try {
      this.workletNode?.disconnect();
      this.scriptProcessor?.disconnect();
      this.sourceNode?.disconnect();
      this.inputAnalyser?.disconnect();
      this.outputAnalyser?.disconnect();
      this.silentGain?.disconnect();
      this.outputGain?.disconnect();
    } catch {
      // ignore disconnect errors
    }

    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    this.inputCtx?.close().catch(() => {});
    this.outputCtx?.close().catch(() => {});
    this.inputCtx = null;
    this.outputCtx = null;
  }
}
