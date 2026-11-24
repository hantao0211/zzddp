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

// Coordinates span the blossom. The pollen disk sits at (44, 45).
const faces = {
  smile: { eyes: "M18 37 Q24 34 28 26 Q31 29 35 36 M53 36 Q59 33 64 27 L70 36", mouth: "M23 54 Q29 63 34 66 Q49 64 65 54" },
  wink: { eyes: "M17 31 L29 35 L18 39 M52 36 Q60 22 69 33", mouth: "M24 56 Q40 73 65 51" },
  laugh: { eyes: "M16 37 L26 25 L35 35 M52 35 L62 24 L72 34", mouth: "M23 52 Q43 59 66 50 Q49 80 32 65 Q26 61 23 52 Z" },
  surprised: { eyes: "M18 32 Q25 20 34 30 M53 27 Q61 15 69 27", mouth: "M34 57 C38 49 54 49 57 56 C60 64 44 72 37 66 Q31 63 34 57 Z" },
} as const;

function FlowerFace() {
  return <svg className="journal-flower-face" viewBox="0 0 88 82" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    {Object.entries(faces).map(([name, face]) => <g key={name} data-pose={name}>
      <path d={face.eyes} /><path d={face.mouth} />
    </g>)}
  </svg>;
}

function chooseFlowerExpression(flower: HTMLSpanElement) {
  const choices = expressions.filter(face => face !== flower.dataset.expression);
  flower.dataset.expression = choices[Math.floor(Math.random() * choices.length)];
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
