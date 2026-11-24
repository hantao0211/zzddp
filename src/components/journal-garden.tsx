"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Flower2, Pencil, Star, Sun } from "lucide-react";

import { useIllustrationMotion } from "./use-illustration-motion";

const stickers = [
  { id: "flower", label: "花朵", Icon: Flower2 },
  { id: "sun", label: "太阳", Icon: Sun },
  { id: "star", label: "星星", Icon: Star },
] as const;
export type JournalSticker = typeof stickers[number]["id"];

const expressions = ["wink", "laugh"] as const;

// The mouth and its tongue share one animated silhouette.
const mouths = {
  smile: "M36 54 Q36 52 38 53 Q44 56 50 53 Q52 52 52 54 Q51 64 44 64 Q37 64 36 54 Z",
  wink: "M36 55 Q36 53 38 54 Q44 56 50 51 Q52 50 52 53 Q51 63 44 63 Q38 63 36 55 Z",
  laugh: "M34 53 Q34 51 37 52 Q44 54 51 52 Q54 51 54 53 Q53 67 44 67 Q35 67 34 53 Z",
} as const;

// The eyes lead each expression and the smile follows.
const expressionTiming = {
  wink: { eyes: [640, "0;.02;.23;.57;1"], mouth: [760, "0;.08;.31;.54;1"] },
  laugh: { eyes: [1050, "0;.02;.34;.57;1"], mouth: [1505, "0;.06;.38;.60;1"] },
} as const;

const faceEasing = "0 0 1 1;.2 0 .35 1;0 0 1 1;.35 0 .55 1";
type Expression = typeof expressions[number];

function FaceOpacity({ pose, from, to }: { pose: Expression; from: number; to: number }) {
  const [duration, times] = expressionTiming[pose].eyes;
  return <animate attributeName="opacity" data-pose={pose} begin="indefinite" dur={duration + "ms"}
    calcMode="spline" keyTimes={times} keySplines={faceEasing} values={[from, from, to, to, from].join(";")} />;
}

function FlowerEye({ right = false }: { right?: boolean }) {
  const gestures = right ? expressions : (["laugh"] as const);
  return <g transform={right ? "translate(60 41) scale(-1 1)" : "translate(28 41)"}>
    <path d="M-6 -15 Q-2 -18 2 -16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <g data-feature="eye">
      {gestures.map(pose => <FaceOpacity key={pose} pose={pose} from={1} to={0} />)}
      {gestures.map(pose => <animateTransform key={pose} data-pose={pose} attributeName="transform"
        type="scale" begin="indefinite" dur={expressionTiming[pose].eyes[0] + "ms"}
        calcMode="spline" keyTimes={expressionTiming[pose].eyes[1]} keySplines={faceEasing}
        values={"1 1;1 1;1 .18;1 .18;1 1"} />)}
      <ellipse cx="-1" cy="0" rx="7.8" ry="8" fill="#fff9ed" />
      <ellipse cx="0.9" cy="0" rx="6.2" ry="7.6" fill="currentColor" />
      <path d="M-11 -4 Q-11 -1 -8 0 Q-5 -10 2 -7 Q6 -6 7 -2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="-0.3" cy="-2.8" r="2.45" fill="#fffdf7" />
      <circle cx="3" cy="2.9" r="1.15" fill="#fffdf7" />
    </g>
    {gestures.map(pose => <path key={pose} data-eyelid={pose} opacity="0" fill="none" stroke="currentColor"
      strokeWidth={pose === "laugh" ? 3.2 : 2.2} strokeLinecap="round" strokeLinejoin="round"
      d={pose === "laugh" ? "M-8 4 Q-5 -4 0 -4 Q5 -4 8 3" : "M-8 -4 Q1 -4 8 3 Q0 -1 -8 3"}>
      <FaceOpacity pose={pose} from={0} to={1} />
    </path>)}
  </g>;
}

function FlowerFace() {
  const mouthClip = useId();
  return <svg className="journal-flower-face" viewBox="0 0 88 82" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={mouthClip}>
        <path data-feature="mouth" d={mouths.smile}>
          {expressions.map(pose => <animate key={pose} data-pose={pose} attributeName="d" begin="indefinite"
            dur={expressionTiming[pose].mouth[0] + "ms"} calcMode="spline" keyTimes={expressionTiming[pose].mouth[1]}
            keySplines={faceEasing} values={[mouths.smile, mouths.smile, mouths[pose], mouths[pose], mouths.smile].join(";")} />)}
        </path>
      </clipPath>
    </defs>
    <FlowerEye /><FlowerEye right />
    {[21, 67].map(x => <g key={x} transform={`translate(${x} 55) rotate(-6)`}>
      <ellipse rx="7.2" ry="3.4" fill="#f5a49a">
        {expressions.map(pose => <FaceOpacity key={pose} pose={pose} from={1} to={0.15} />)}
      </ellipse>
      <path d="M-5 2l2-4 M-.5 2l2-4 M4 2l2-4" fill="none" stroke="#ef7f8a" strokeWidth="1.5" strokeLinecap="round" opacity="0">
        {expressions.map(pose => <FaceOpacity key={pose} pose={pose} from={0} to={1} />)}
      </path>
      <path d="M-3 1l1-2 M0 1l1-2 M3 1l1-2" fill="none" stroke="#d77379" strokeWidth=".8" strokeLinecap="round" />
    </g>)}
    <g clipPath={`url(#${mouthClip})`}>
      <rect x="33" y="47" width="22" height="22" fill="#af405a" />
      <ellipse cx="44" cy="63.5" rx="7.2" ry="5.8" fill="#ff98a6" />
    </g>
  </svg>;
}

function chooseFlowerExpression(flower: HTMLSpanElement) {
  const choices = expressions.filter(face => face !== flower.dataset.expression);
  const pose = choices[Math.floor(Math.random() * choices.length)];
  flower.dataset.expression = pose;
  const motions = flower.querySelectorAll<SVGAnimationElement>(`[data-pose="${pose}"]`);
  motions.forEach(motion => motion.beginElement());
  return () => motions.forEach(motion => motion.endElement());
}

/** A small, optional decoration. It never represents a reward or task progress. */
export function useJournalDecoration(viewerKey: string) {
  const [sticker, setSticker] = useState<JournalSticker>("flower");
  const storageKey = `xiaobu:journal-decoration:${viewerKey}`;
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(storageKey); } catch { /* Decoration also works without storage. */ }
    setSticker(stickers.find(item => item.id === saved)?.id ?? "flower");
  }, [storageKey]);
  function choose(next: JournalSticker) {
    setSticker(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Keep the current choice for this visit. */ }
  }
  return { sticker, choose };
}

function JournalStickerPicker({ sticker, onChoose }: { sticker: JournalSticker; onChoose: (next: JournalSticker) => void }) {
  return <div className="journal-stickers" role="group" aria-label="选择花盆贴纸">
    {stickers.map(item => <button type="button" key={item.id} aria-label={`选择${item.label}贴纸`} aria-pressed={sticker === item.id} title={`${item.label}贴纸`} onClick={() => onChoose(item.id)}><item.Icon size={19} aria-hidden="true" /></button>)}
  </div>;
}

export function JournalGarden({ hint, sticker, onChoose }: { hint: string; sticker: JournalSticker; onChoose: (next: JournalSticker) => void }) {
  const [open, setOpen] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const flower = useIllustrationMotion(chooseFlowerExpression);
  const pickerId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !tools.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const selected = stickers.find(item => item.id === sticker)!;
  const Icon = selected.Icon;
  return <section className="journal-garden" aria-label="手帐花园">
    <span className="journal-tape-label">今天也在长大</span>
    <div className="journal-garden-copy">
      <h2 className="journal-motto"><span className="journal-motto-line">让<span className="journal-motto-small">小小</span>的<span className="journal-motto-effort">努力</span></span><span className="journal-motto-line"><span className="journal-motto-open">开出</span><span className="journal-motto-own">自己的</span><span className="journal-motto-flower">花</span></span></h2>
      <p className="study-next-step">{hint}</p>
    </div>
    <div className="journal-garden-tools" ref={tools} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button type="button" className="journal-garden-trigger" ref={trigger} aria-label="装饰我的花盆" title="装饰我的花盆" aria-expanded={open} aria-controls={pickerId} onClick={() => setOpen(!open)}>
        <span className="journal-garden-decoration" role="img" aria-label={`花盆贴着${selected.label}贴纸`}>
          <span ref={flower} className="journal-flower" aria-hidden="true">
            <span className="journal-ground" />
            <span className="journal-flower-stalk">
              <span className="journal-stem" />
              {[1, 2, 3, 4, 5].map(n => <span className={`journal-petal p${n}`} key={n} />)}
              <span className="journal-flower-center" />
              <FlowerFace />
              <span className="journal-leaf" /><span className="journal-leaf l2" />
            </span>
            <span className="journal-book-stack" /><span className="journal-book-stack s2" />
            <span className="journal-pot" /><span className="journal-pot-label"><Icon size={16} /></span>
          </span>
        </span>
        <Pencil className="journal-garden-edit" size={13} aria-hidden="true" />
      </button>
      <div id={pickerId} className="journal-garden-picker" hidden={!open}>
        <p>装饰我的花盆</p>
        <JournalStickerPicker sticker={sticker} onChoose={next => { onChoose(next); setOpen(false); trigger.current?.focus(); }} />
      </div>
    </div>
  </section>;
}
