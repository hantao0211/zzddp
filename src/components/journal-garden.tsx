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
  smile: { eyes: "M18 37 Q24 34 28 26 Q31 29 35 36 M53 36 Q59 33 64 27 Q67 31 70 36", mouth: "M23 54 Q29 63 34 66 Q49 64 65 54 Q49 64 34 66 Q29 63 23 54 Z" },
  wink: { eyes: "M17 31 Q24 33 29 35 Q24 36 18 39 M52 36 Q57 27 61 27 Q65 27 69 33", mouth: "M24 56 Q33 65 40 64 Q53 62 65 51 Q53 62 40 64 Q33 65 24 56 Z" },
  laugh: { eyes: "M16 37 Q20 32 26 25 Q31 30 35 35 M52 35 Q57 29 62 24 Q67 29 72 34", mouth: "M23 52 Q32 56 43 55 Q55 55 66 50 Q53 74 40 68 Q29 65 23 52 Z" },
  surprised: { eyes: "M18 32 Q22 24 27 25 Q31 25 34 30 M53 27 Q57 20 62 21 Q66 21 69 27", mouth: "M34 57 Q37 50 46 51 Q58 50 58 57 Q58 66 45 68 Q33 69 34 57 Z" },
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
    {(["eyes", "mouth"] as const).map(part => <path key={part} d={faces.smile[part]}>
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
