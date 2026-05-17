import { useEffect, useRef } from "react";

const BUF = new Map<string, number[]>();

export function pushSparkValue(key: string, v: number, maxLen = 60): void {
  let arr = BUF.get(key);
  if (!arr) { arr = []; BUF.set(key, arr); }
  arr.push(Number.isFinite(v) ? v : 0);
  if (arr.length > maxLen) arr.shift();
}

interface Props {
  channel: string;
  width?: number;
  height?: number;
  stroke?: string;
  fillTop?: string;
  min?: number;
  max?: number;
}
export function Sparkline({ channel, width = 80, height = 22, stroke = "#3a8bff", fillTop = "rgba(58,139,255,0.40)", min, max }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const paint = () => {
      const cvs = canvasRef.current;
      if (!cvs) return;
      const dpr = window.devicePixelRatio || 1;
      if (cvs.width !== width * dpr) { cvs.width = width * dpr; cvs.height = height * dpr; }
      const ctx = cvs.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const arr = BUF.get(channel) || [];
      if (arr.length < 2) { ctx.fillStyle = "#2a3346"; ctx.fillRect(0, height - 1, width, 1); raf = requestAnimationFrame(paint); return; }
      let lo = min ?? Math.min(...arr);
      let hi = max ?? Math.max(...arr);
      if (hi - lo < 1e-3) hi = lo + 1;
      const pad = 2;
      ctx.beginPath();
      ctx.moveTo(0, height);
      arr.forEach((v, i) => {
        const x = (i / (arr.length - 1)) * width;
        const y = height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad);
        ctx.lineTo(x, y);
      });
      ctx.lineTo(width, height); ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, fillTop);
      grad.addColorStop(1, "rgba(58,139,255,0.02)");
      ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath();
      arr.forEach((v, i) => {
        const x = (i / (arr.length - 1)) * width;
        const y = height - pad - ((v - lo) / (hi - lo)) * (height - 2 * pad);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.lineJoin = "round"; ctx.stroke();
      const last = arr[arr.length - 1];
      const yL = height - pad - ((last - lo) / (hi - lo)) * (height - 2 * pad);
      ctx.beginPath(); ctx.arc(width - 2, yL, 1.6, 0, Math.PI * 2); ctx.fillStyle = "#fff"; ctx.fill();
      raf = requestAnimationFrame(paint);
    };
    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [channel, width, height, stroke, fillTop, min, max]);
  return <canvas ref={canvasRef} className="spark" style={{ width, height }} />;
}
