import { useEffect, useRef, type CSSProperties } from 'react';
import { usePrefersReducedMotion } from '../../hooks/use-prefers-reduced-motion';
import { BEAM, createDustAnimation } from './dust';
import styles from './HeroBackground.module.css';

/** Optional self-hosted background video (never a third-party embed). */
export interface HeroVideo {
  webm?: string;
  mp4?: string;
  /** Shown before the video plays and instead of it under reduced motion. */
  poster: string;
}

interface HeroBackgroundProps {
  video?: HeroVideo;
  className?: string;
}

const MAX_DPR = 1.5;
const point = ({ x, y }: { x: number; y: number }) => `${String(x * 100)}% ${String(y * 100)}%`;
const beamStyle: CSSProperties = {
  clipPath: `polygon(${point(BEAM.apex)}, ${point(BEAM.right)}, ${point(BEAM.left)})`,
};

/**
 * Decorative cinema background: projector beam, drifting dust (canvas) and a crimson glow. Place it
 * as the first child of a `position: relative` hero. The dust pauses when the hero is off screen or
 * the tab is hidden, and is a single still frame under prefers-reduced-motion.
 */
export function HeroBackground({ video, className }: HeroBackgroundProps) {
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!root || !canvas || !ctx) return;

    const dust = createDustAnimation(ctx);
    let inView = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const width = root.clientWidth;
      const height = root.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      dust.setSize(width, height, dpr);
      if (!dust.running) dust.renderStatic();
    };

    const update = () => {
      const visible = inView && !document.hidden;
      dust.setRunning(visible && !reducedMotion);
      const media = videoRef.current;
      if (!media) return;
      if (visible) media.play().catch(() => undefined);
      else media.pause();
    };

    resize();
    update();

    const resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(resize) : undefined;
    resizeObserver?.observe(root);
    const intersectionObserver =
      'IntersectionObserver' in window
        ? new IntersectionObserver(([entry]) => {
            inView = entry?.isIntersecting ?? true;
            update();
          })
        : undefined;
    intersectionObserver?.observe(root);
    document.addEventListener('visibilitychange', update);

    return () => {
      dust.destroy();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [reducedMotion]);

  return (
    <div
      ref={rootRef}
      className={[styles.root, className].filter(Boolean).join(' ')}
      aria-hidden="true"
    >
      {video &&
        (reducedMotion ? (
          <img className={styles.media} src={video.poster} alt="" />
        ) : (
          <video
            ref={videoRef}
            className={styles.media}
            poster={video.poster}
            muted
            loop
            playsInline
            autoPlay
            preload="metadata"
            disablePictureInPicture
          >
            {video.webm && <source src={video.webm} type="video/webm" />}
            {video.mp4 && <source src={video.mp4} type="video/mp4" />}
          </video>
        ))}
      <div className={styles.lamp} />
      <div className={styles.beam} style={beamStyle} />
      <canvas ref={canvasRef} className={styles.dust} />
      <div className={styles.vignette} />
      <div className={styles.glow} />
    </div>
  );
}
