import { useState, useEffect, useRef, useCallback } from "react";
import { Ticker, Presets } from "@tombcato/smart-ticker";
import "@tombcato/smart-ticker/style.css";
import { nicknames } from "./data/nicknames";

const BAR_COUNT = 32;
const FFT_SIZE = 512;
const MIN_FREQ = 60;
const MAX_FREQ = 14000;
const SMOOTHING = 0.6;
const STORAGE_KEY = "miercoles-audio-paused";
const HOLD_DELAY = 200;
const HOLD_DURATION = 600;
const FADE_DURATION = 1000;

function shuffle<T>(array: T[], exclude?: T): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  // Ensure first element isn't the excluded value (prevents consecutive duplicates)
  if (exclude !== undefined && result[0] === exclude && result.length > 1) {
    const swapIdx = 1 + Math.floor(Math.random() * (result.length - 1));
    [result[0], result[swapIdx]] = [result[swapIdx], result[0]];
  }
  return result;
}

function App() {
  const shuffledRef = useRef<string[]>(shuffle(nicknames));
  const indexRef = useRef(0);
  const [nickname, setNickname] = useState(() => shuffledRef.current[0]);
  const [copied, setCopied] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, percent: 0 });
  const [isPlaying, setIsPlaying] = useState(false);
  const [bars, setBars] = useState<number[]>(new Array(BAR_COUNT).fill(0));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const holdStartRef = useRef<number | null>(null);
  const holdAnimationRef = useRef<number | null>(null);
  const didTriggerHoldRef = useRef(false);
  const nicknameRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const updateBars = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;
    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(dataArray);

    const sampleRate = audioContextRef.current.sampleRate;
    const binCount = analyserRef.current.frequencyBinCount;
    const freqPerBin = sampleRate / FFT_SIZE;

    // Logarithmic frequency scaling for human-like perception
    const logMin = Math.log10(MIN_FREQ);
    const logMax = Math.log10(MAX_FREQ);
    const logRange = logMax - logMin;

    const newBars: number[] = [];
    for (let i = 0; i < BAR_COUNT; i++) {
      // Calculate frequency range for this bar using log scale
      const lowFreq = Math.pow(10, logMin + (logRange * i) / BAR_COUNT);
      const highFreq = Math.pow(10, logMin + (logRange * (i + 1)) / BAR_COUNT);

      // Convert frequencies to FFT bin indices
      const lowBin = Math.max(0, Math.floor(lowFreq / freqPerBin));
      const highBin = Math.min(binCount - 1, Math.ceil(highFreq / freqPerBin));

      // Average the bins in this range
      let sum = 0;
      let count = 0;
      for (let bin = lowBin; bin <= highBin; bin++) {
        sum += dataArray[bin];
        count++;
      }

      const avg = count > 0 ? sum / count / 255 : 0;
      // Apply compression to tame bass and lift mids/highs for better nuance
      const bassAttenuation = 0.7 + (i / BAR_COUNT) * 0.3; // 0.7 for bass, 1.0 for highs
      const compressed = Math.pow(avg, 0.8); // Compress dynamic range slightly
      newBars.push(Math.min(1, compressed * bassAttenuation));
    }

    setBars(newBars);
    animationRef.current = requestAnimationFrame(updateBars);
  }, []);

  const initAudioContext = useCallback(() => {
    if (audioContextRef.current || !audioRef.current) return;
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = SMOOTHING;
    analyser.minDecibels = -80;
    analyser.maxDecibels = -20;
    const source = audioContext.createMediaElementSource(audioRef.current);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const handlePause = () => {
      setIsPlaying(false);
      localStorage.setItem(STORAGE_KEY, "true");
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setBars(new Array(BAR_COUNT).fill(0));
    };
    const handlePlay = () => {
      setIsPlaying(true);
      localStorage.removeItem(STORAGE_KEY);
      updateBars();
    };
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);
    return () => {
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [updateBars]);

  // Fade in audio volume
  const fadeInAudio = useCallback((audio: HTMLAudioElement) => {
    audio.volume = 0;
    const startTime = Date.now();
    const fadeStep = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / FADE_DURATION);
      audio.volume = progress;
      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      }
    };
    requestAnimationFrame(fadeStep);
  }, []);

  // Handle the initial "tap to begin" interaction
  const handleStart = useCallback(async () => {
    if (hasStarted) return;
    setHasStarted(true);

    // Check if user previously paused
    const wasPaused = localStorage.getItem(STORAGE_KEY) === "true";
    if (wasPaused || !audioRef.current) return;

    try {
      initAudioContext();
      if (audioContextRef.current?.state === "suspended") {
        await audioContextRef.current.resume();
      }
      const audio = audioRef.current;
      if (audio.readyState < 2) {
        audio.load();
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            audio.removeEventListener("canplay", onCanPlay);
            resolve();
          };
          audio.addEventListener("canplay", onCanPlay);
        });
      }
      fadeInAudio(audio);
      await audio.play();
    } catch (err) {
      console.error("Audio playback failed:", err);
    }
  }, [hasStarted, initAudioContext, fadeInAudio]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!nicknameRef.current) return;
    const rect = nicknameRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setMousePos({ x, percent });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!nicknameRef.current || e.touches.length === 0) return;
    const touch = e.touches[0];
    const rect = nicknameRef.current.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setMousePos({ x, percent });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    setIsHovered(true);
    handleTouchMove(e);
  };

  const handleTouchEnd = () => {
    setIsHovered(false);
    setMousePos({ x: 0, percent: 0 });
  };

  const generateNew = () => {
    indexRef.current++;
    if (indexRef.current >= shuffledRef.current.length) {
      const lastNickname = shuffledRef.current[shuffledRef.current.length - 1];
      shuffledRef.current = shuffle(nicknames, lastNickname);
      indexRef.current = 0;
    }
    setNickname(shuffledRef.current[indexRef.current]);
  };

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    const phrase = `Hi my little ${nickname}`;
    navigator.clipboard.writeText(phrase);
    setCopied(true);
  };

  const toggleMusic = async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    // Don't toggle if hold was triggered
    if (didTriggerHoldRef.current) {
      didTriggerHoldRef.current = false;
      return;
    }
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
    } else {
      try {
        // Initialize audio context on first play (requires user gesture)
        initAudioContext();
        if (audioContextRef.current?.state === "suspended") {
          await audioContextRef.current.resume();
        }
        // Load the audio if not ready
        if (audioRef.current.readyState < 2) {
          audioRef.current.load();
          await new Promise<void>((resolve, reject) => {
            const audio = audioRef.current!;
            const onCanPlay = () => {
              audio.removeEventListener("canplay", onCanPlay);
              audio.removeEventListener("error", onError);
              resolve();
            };
            const onError = () => {
              audio.removeEventListener("canplay", onCanPlay);
              audio.removeEventListener("error", onError);
              reject(new Error("Failed to load audio"));
            };
            audio.addEventListener("canplay", onCanPlay);
            audio.addEventListener("error", onError);
          });
        }
        await audioRef.current.play();
      } catch (err) {
        console.error("Audio playback failed:", err);
      }
    }
  };

  const updateHoldProgress = useCallback(() => {
    if (holdStartRef.current === null) return;
    const elapsed = Date.now() - holdStartRef.current;

    // Only show progress after the delay
    const progressElapsed = Math.max(0, elapsed - HOLD_DELAY);
    const progress = Math.min(1, progressElapsed / HOLD_DURATION);
    setHoldProgress(progress);

    if (progress >= 1) {
      didTriggerHoldRef.current = true;
      setIsFullscreen((prev) => !prev);
      setHoldProgress(0);
      holdStartRef.current = null;
      holdAnimationRef.current = null;
    } else {
      holdAnimationRef.current = requestAnimationFrame(updateHoldProgress);
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      holdStartRef.current = Date.now();
      didTriggerHoldRef.current = false;
      holdAnimationRef.current = requestAnimationFrame(updateHoldProgress);
    },
    [updateHoldProgress]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (holdAnimationRef.current) {
      cancelAnimationFrame(holdAnimationRef.current);
      holdAnimationRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(0);
  }, []);

  const handlePointerCancel = useCallback(() => {
    if (holdAnimationRef.current) {
      cancelAnimationFrame(holdAnimationRef.current);
      holdAnimationRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(0);
  }, []);

  return (
    <div
      onClick={hasStarted ? generateNew : handleStart}
      className="min-h-screen flex flex-col items-center p-6 sm:p-8 cursor-pointer select-none transition-colors"
      style={{ backgroundColor: "#0D0A14" }}
    >
      {/* Audio element - always mounted */}
      <audio
        ref={audioRef}
        src={import.meta.env.BASE_URL + "lady-gaga.mp3"}
        loop
        preload="metadata"
      />

      {/* Intro screen */}
      <div
        className="absolute inset-0 flex items-center justify-center transition-opacity duration-1000"
        style={{
          opacity: hasStarted ? 0 : 1,
          pointerEvents: hasStarted ? "none" : "auto",
        }}
      >
        <p
          className="text-2xl sm:text-3xl md:text-4xl tracking-wide animate-pulse"
          style={{ color: "#8B7FA8" }}
        >
          tap anywhere to begin
        </p>
      </div>

      {/* Main content */}
      <div
        className="flex-1 flex flex-col items-center justify-center w-full transition-opacity duration-1000"
        style={{
          opacity: hasStarted ? 1 : 0,
          pointerEvents: hasStarted ? "auto" : "none",
        }}
      >
        <div className="text-center">
          <p
            className="base-statement text-5xl sm:text-6xl md:text-7xl lg:text-8xl tracking-wide mb-4"
            style={{ color: "#8B7FA8" }}
          >
            Hi my little
          </p>
          <div
            ref={nicknameRef}
            onClick={copyToClipboard}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => {
              setIsHovered(false);
              setMousePos({ x: 0, percent: 0 });
            }}
            onMouseMove={handleMouseMove}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`nickname-wrapper text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-normal transition-all duration-200 max-w-full break-words ${isHovered ? "hovered" : ""} ${copied ? "copied" : ""}`}
            style={
              {
                "--hover-gradient": `radial-gradient(circle at ${mousePos.percent}% 50%,
                  #F0E6FF 0%,
                  #D8A0FF 15%,
                  #9B4DCA 35%,
                  #5E2D79 55%,
                  #2D1B4E 80%)`,
              } as React.CSSProperties
            }
          >
            <span className="nickname-words">
              {(() => {
                const words = nickname.split(" ");
                const maxWords = 4;
                return Array.from({ length: maxWords }, (_, idx) => (
                  <span
                    key={idx}
                    className="nickname-word"
                    style={{
                      display: idx < words.length ? "inline-flex" : "none",
                    }}
                  >
                    <Ticker
                      value={words[idx] || ""}
                      duration={800}
                      easing="easeOutCubic"
                      characterLists={[Presets.ALPHABET + "áéíóúñü"]}
                    />
                    {idx < words.length - 1 && (
                      <span className="nickname-space">&nbsp;</span>
                    )}
                  </span>
                ));
              })()}
            </span>
          </div>
        </div>
        <p
          className={`mt-8 text-sm transition-opacity duration-300 ${
            copied ? "opacity-100" : "opacity-0"
          }`}
          style={{ color: "#9A8CB8" }}
        >
          Copied to clipboard
        </p>
      </div>
      <p
        className="pb-6 text-xs text-center px-4 transition-opacity duration-1000"
        style={{
          color: "#3A2F52",
          opacity: hasStarted ? 1 : 0,
        }}
      >
        tap to summon another, cara mia — tap the name to claim it
      </p>

      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: "rgba(13, 10, 20, 0.95)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center justify-center">
            <svg
              className="absolute"
              width="400"
              height="400"
              viewBox="0 0 400 400"
              style={{
                opacity: isPlaying ? 1 : 0.3,
                transition: "opacity 0.2s",
              }}
            >
              {bars.map((height, i) => {
                const angle = (i / BAR_COUNT) * 360 - 90;
                const radians = (angle * Math.PI) / 180;
                const innerRadius = 90;
                const barLength = 30 + height * 80;
                const x1 = 200 + Math.cos(radians) * innerRadius;
                const y1 = 200 + Math.sin(radians) * innerRadius;
                const x2 = 200 + Math.cos(radians) * (innerRadius + barLength);
                const y2 = 200 + Math.sin(radians) * (innerRadius + barLength);
                return (
                  <line
                    key={i}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={(() => {
                      const freqRatio = i / (BAR_COUNT - 1);
                      const saturation = 15 + freqRatio * 75; // 15% (dark) to 90% (purple)
                      const lightness =
                        6 + freqRatio * 12 + height * (15 + freqRatio * 35);
                      return `hsl(265, ${saturation}%, ${lightness}%)`;
                    })()}
                    strokeWidth={8}
                    strokeLinecap="round"
                  />
                );
              })}
            </svg>
            {holdProgress > 0 && (
              <svg
                className="absolute z-20"
                width="180"
                height="180"
                viewBox="0 0 180 180"
              >
                <circle
                  cx="90"
                  cy="90"
                  r="85"
                  fill="none"
                  stroke="#3A2F52"
                  strokeWidth="4"
                />
                <circle
                  cx="90"
                  cy="90"
                  r="85"
                  fill="none"
                  stroke="#D8A0FF"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 85}
                  strokeDashoffset={2 * Math.PI * 85 * (1 - holdProgress)}
                  style={{
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                  }}
                />
              </svg>
            )}
            <button
              onClick={toggleMusic}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onPointerLeave={handlePointerCancel}
              onContextMenu={(e) => e.preventDefault()}
              className="relative z-10 w-40 h-40 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 touch-manipulation"
              style={{
                backgroundColor: isPlaying ? "#5E2D79" : "#2D1B4E",
                border: "2px solid #6B5B8C",
                touchAction: "none",
                WebkitTouchCallout: "none",
                WebkitUserSelect: "none",
                userSelect: "none",
              }}
              aria-label={isPlaying ? "Pause music" : "Play music"}
            >
              {isPlaying ? (
                <svg width="64" height="64" viewBox="0 0 16 16" fill="#D8A0FF">
                  <rect x="3" y="2" width="4" height="12" rx="1" />
                  <rect x="9" y="2" width="4" height="12" rx="1" />
                </svg>
              ) : (
                <svg width="64" height="64" viewBox="0 0 16 16" fill="#D8A0FF">
                  <path d="M4 2.5v11l9-5.5-9-5.5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      <div
        className="fixed top-10 right-10 md:top-12 md:right-12 transition-opacity duration-1000"
        style={{
          opacity: hasStarted ? 1 : 0,
          pointerEvents: hasStarted ? "auto" : "none",
        }}
      >
        <div className="relative flex items-center justify-center music-button-wrapper">
          <svg
            className="absolute visualizer-svg"
            viewBox="0 0 100 100"
            style={{
              opacity: isPlaying ? 1 : 0,
              transition: "opacity 0.2s",
            }}
          >
            {bars.map((height, i) => {
              const angle = (i / BAR_COUNT) * 360 - 90;
              const radians = (angle * Math.PI) / 180;
              const innerRadius = 24;
              const barLength = 8 + height * 18;
              const x1 = 50 + Math.cos(radians) * innerRadius;
              const y1 = 50 + Math.sin(radians) * innerRadius;
              const x2 = 50 + Math.cos(radians) * (innerRadius + barLength);
              const y2 = 50 + Math.sin(radians) * (innerRadius + barLength);
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={(() => {
                    const freqRatio = i / (BAR_COUNT - 1);
                    const saturation = 15 + freqRatio * 75; // 15% (dark) to 90% (purple)
                    const lightness =
                      6 + freqRatio * 12 + height * (15 + freqRatio * 35);
                    return `hsl(265, ${saturation}%, ${lightness}%)`;
                  })()}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
          {holdProgress > 0 && !isFullscreen && (
            <svg
              className="absolute z-20 hold-progress-svg"
              viewBox="0 0 52 52"
            >
              <circle
                cx="26"
                cy="26"
                r="24"
                fill="none"
                stroke="#3A2F52"
                strokeWidth="2"
              />
              <circle
                cx="26"
                cy="26"
                r="24"
                fill="none"
                stroke="#D8A0FF"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 24}
                strokeDashoffset={2 * Math.PI * 24 * (1 - holdProgress)}
                style={{
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                }}
              />
            </svg>
          )}
          <button
            onClick={toggleMusic}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={handlePointerCancel}
            onContextMenu={(e) => e.preventDefault()}
            className="music-button relative z-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 touch-manipulation"
            style={{
              backgroundColor: isPlaying ? "#5E2D79" : "#2D1B4E",
              border: "1px solid #6B5B8C",
              touchAction: "none",
              WebkitTouchCallout: "none",
              WebkitUserSelect: "none",
              userSelect: "none",
            }}
            aria-label={isPlaying ? "Pause music" : "Play music"}
          >
            {isPlaying ? (
              <svg className="music-icon" viewBox="0 0 16 16" fill="#D8A0FF">
                <rect x="3" y="2" width="4" height="12" rx="1" />
                <rect x="9" y="2" width="4" height="12" rx="1" />
              </svg>
            ) : (
              <svg className="music-icon" viewBox="0 0 16 16" fill="#D8A0FF">
                <path d="M4 2.5v11l9-5.5-9-5.5z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
