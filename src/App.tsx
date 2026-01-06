import { useState, useEffect, useRef } from "react";
import { Ticker, Presets } from "@tombcato/smart-ticker";
import "@tombcato/smart-ticker/style.css";
import { nicknames } from "./data/nicknames";

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
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
  const nicknameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (copied) {
      const timer = setTimeout(() => setCopied(false), 1500);
      return () => clearTimeout(timer);
    }
  }, [copied]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!nicknameRef.current) return;
    const rect = nicknameRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setMousePos({ x, percent });
  };

  const generateNew = () => {
    indexRef.current++;
    if (indexRef.current >= shuffledRef.current.length) {
      shuffledRef.current = shuffle(nicknames);
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

  return (
    <div
      onClick={generateNew}
      className="min-h-screen flex flex-col items-center justify-center p-6 sm:p-8 cursor-pointer select-none transition-colors"
      style={{ backgroundColor: "#0D0A14" }}
    >
      <div className="text-center">
        <p
          className="base-statement text-4xl sm:text-5xl md:text-6xl lg:text-7xl tracking-wide mb-4"
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
          className={`nickname-wrapper text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-normal transition-all duration-200 decoration-2 underline-offset-8 ${isHovered ? "hovered" : ""} ${copied ? "copied" : ""}`}
          style={
            {
              textDecoration: isHovered && !copied ? "underline" : "none",
              textDecorationColor: "#6B5B8C",
              "--hover-gradient": `radial-gradient(circle at ${mousePos.percent}% 50%,
              #F0E6FF 0%,
              #D8A0FF 15%,
              #9B4DCA 35%,
              #5E2D79 55%,
              #2D1B4E 80%)`,
            } as React.CSSProperties
          }
        >
          <Ticker
            value={nickname}
            duration={800}
            easing="easeOutCubic"
            characterLists={[Presets.ALPHABET + " áéíóúñü"]}
          />
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
      <p className="fixed bottom-6 text-xs" style={{ color: "#524670" }}>
        tap anywhere to generate, tap nickname to copy
      </p>
    </div>
  );
}

export default App;
