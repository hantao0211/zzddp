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

const expressions = ["wink", "laugh", "surprised"] as const;

// Matching curve segments let the eyes and mouth move continuously between poses.
const faces = {
  smile: {
    eyes: "M17 35 Q21 28 26 28 Q31 28 35 35 M53 35 Q57 28 62 28 Q67 28 71 35",
    mouth: "M23 53 Q33 59 44 59 Q55 59 65 53 Q59 65 44 65 Q29 65 23 53 Z",
  },
  wink: {
    eyes: "M17 34 Q21 36 26 36 Q31 36 35 34 M53 34 Q57 26 62 26 Q67 26 71 34",
    mouth: "M23 54 Q33 59 44 59 Q55 59 65 50 Q59 65 44 65 Q29 65 23 54 Z",
  },
  laugh: {
    eyes: "M16 34 Q20 24 26 24 Q32 24 36 34 M52 34 Q56 24 62 24 Q68 24 72 34",
    mouth: "M23 51 Q34 53 44 53 Q54 53 65 51 Q61 69 44 69 Q27 69 23 51 Z",
  },
  surprised: {
    eyes: "M18 29 Q21 22 26 22 Q31 22 34 29 M54 29 Q57 22 62 22 Q67 22 70 29",
    mouth: "M34 57 Q34 48 44 48 Q54 48 54 57 Q54 66 44 66 Q34 66 34 57 Z",
  },
} as const;

// Eye reaction first, then the mouth. Hold a surprised look longer than a wink.
const expressionTiming = {
  wink: { eyes: [360, "0;.02;.25;.44;1"], mouth: [665, "0;.08;.31;.48;1"] },
  laugh: { eyes: [1050, "0;.02;.34;.57;1"], mouth: [1505, "0;.06;.38;.60;1"] },
  surprised: { eyes: [950, "0;.02;.16;.64;1"], mouth: [1160, "0;.095;.24;.67;1"] },
} as const;

function FlowerFace() {
  return <svg className="journal-flower-face" viewBox="0 0 88 82" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {(["eyes", "mouth"] as const).map(part => <path key={part} d={faces.smile[part]}
      fill={part === "mouth" ? "currentColor" : "none"} stroke={part === "eyes" ? "currentColor" : "none"}>
      {expressions.map(pose => <animate key={pose} data-pose={pose} attributeName="d" begin="indefinite"
        dur={expressionTiming[pose][part][0] + "ms"} calcMode="spline" keyTimes={expressionTiming[pose][part][1]}
        keySplines="0 0 1 1;.2 0 .35 1;0 0 1 1;.35 0 .55 1"
        values={[faces.smile[part], faces.smile[part], faces[pose][part], faces[pose][part], faces.smile[part]].join(";")} />)}
    </path>)}
  </svg>;
}

function chooseFlowerExpression(flower: HTMLSpanElement) {
  const choices = expressions.filter(face => face !== flower.dataset.expression);
  const pose = choices[Math.floor(Math.random() * choices.length)];
  flower.dataset.expression = pose;
  const motions = flower.querySelectorAll<SVGAnimateElement>(`animate[data-pose="${pose}"]`);
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
