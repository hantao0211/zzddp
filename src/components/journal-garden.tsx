"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Flower2, Pencil, Star, Sun } from "lucide-react";

import { useIllustrationMotion } from "./use-illustration-motion";

const stickers = [
  { id: "flower", label: "花朵", Icon: Flower2 },
  { id: "sun", label: "太阳", Icon: Sun },
  { id: "star", label: "星星", Icon: Star },
] as const;
export type JournalSticker = typeof stickers[number]["id"];

const expressions = ["blink", "doubleBlink", "wink"] as const;
type Expression = typeof expressions[number];

// Each beat starts and settles in the curved-eye smile. A blink closes in about 80 ms.
const eyeBeats = {
  blink: { times: "0;.055;.35;.39;.44;.94;1", open: [0, 1, 1, 0, 1, 1, 0] },
  doubleBlink: { times: "0;.055;.31;.35;.40;.50;.54;.59;.94;1", open: [0, 1, 1, 0, 1, 1, 0, 1, 1, 0] },
  wink: { times: "0;.055;.27;.32;.65;.70;.94;1", open: [0, 1, 1, 0, 0, 1, 1, 0] },
} as const;
const faceDuration = "2s";
const mouths = {
  smile: "M36 54 Q36 52 38 53 Q44 56 50 53 Q52 52 52 54 Q51 64 44 64 Q37 64 36 54 Z",
  wink: "M36 55 Q36 53 38 54 Q44 56 50 51 Q52 50 52 53 Q51 63 44 63 Q38 63 36 55 Z",
  laugh: "M34 53 Q34 51 37 52 Q44 54 51 52 Q54 51 54 53 Q53 67 44 67 Q35 67 34 53 Z",
} as const;

function FaceOpacity({ pose, from, to }: { pose: Expression; from: number; to: number }) {
  return <animate attributeName="opacity" data-pose={pose} begin="indefinite" dur={faceDuration}
    keyTimes="0;.04;.11;.93;1" values={[from, from, to, to, from].join(";")} />;
}

function OpenFlowerEye() {
  return <>
    <ellipse cx="-1" cy="0" rx="7.8" ry="8" fill="#fff9ed" />
    <ellipse cx="0.9" cy="0" rx="6.2" ry="7.6" fill="currentColor" />
    <path d="M-11 -4 Q-11 -1 -8 0 Q-5 -10 2 -7 Q6 -6 7 -2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <circle cx="-0.3" cy="-2.8" r="2.45" fill="#fffdf7" />
    <circle cx="3" cy="2.9" r="1.15" fill="#fffdf7" />
  </>;
}

function WorriedFlowerFace() {
  return <g className="journal-worried-face">
    {[false, true].map(right => <g key={String(right)} transform={right ? "translate(60 42) scale(-1 1)" : "translate(28 42)"}>
      <path d="M-7 -12 Q-1 -12 4 -17" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <OpenFlowerEye />
      <ellipse cx="-7" cy="11" rx="5.5" ry="2.5" fill="#f5a49a"/>
    </g>)}
    <ellipse cx="44" cy="57" rx="4.8" ry="5.6" fill="#a04459"/>
    <ellipse cx="44" cy="60" rx="2.8" ry="1.6" fill="#ff98a6"/>
    <path d="M73 22 Q73 26 76 29 C79 34 72 37 70 32 Q69 30 73 22Z" fill="#77b9c2"/>
  </g>;
}

function FlowerEye({ right = false }: { right?: boolean }) {
  function opacityFrames(pose: Expression, layer: "eye" | "arc" | "wink") {
    const beat = eyeBeats[pose];
    return beat.open.map((open, index) => {
      const winking = pose === "wink" && (index === 3 || index === 4);
      if (layer === "wink") return Number(winking && right);
      if (winking) return Number(layer === "eye" && !right);
      return layer === "eye" ? open : 1 - open;
    });
  }
  function animateOpacity(layer: "eye" | "arc" | "wink") {
    return expressions.map(pose => <animate key={pose} attributeName="opacity" data-pose={pose}
      begin="indefinite" dur={faceDuration} keyTimes={eyeBeats[pose].times} values={opacityFrames(pose, layer).join(";")} />);
  }
  return <g transform={right ? "translate(60 41) scale(-1 1)" : "translate(28 41)"}>
    <path d="M-6 -15 Q-2 -18 2 -16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <g data-feature="eye" opacity="0">
      {animateOpacity("eye")}
      {expressions.map(pose => <animateTransform key={pose} data-pose={pose} attributeName="transform"
        type="scale" begin="indefinite" dur={faceDuration} keyTimes={eyeBeats[pose].times}
        values={opacityFrames(pose, "eye").map(open => open ? "1 1" : "1 .16").join(";")} />)}
      <OpenFlowerEye />
    </g>
    <path data-eyelid="laugh" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round"
      d="M-8 4 Q-5 -4 0 -4 Q5 -4 8 3">{animateOpacity("arc")}</path>
    {right && <path data-eyelid="wink" opacity="0" fill="none" stroke="currentColor" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" d="M-8 -4 Q1 -4 8 3 Q0 -1 -8 3">{animateOpacity("wink")}</path>}
  </g>;
}

function FlowerFace({ reminder }: { reminder?: "waiting" | "speaking" }) {
  const mouthClip = useId();
  const face = useIllustrationMotion<SVGSVGElement>(chooseFlowerExpression, 3200, 4800);
  return <svg ref={face} data-reminder={reminder} className="journal-flower-face" viewBox="0 0 88 82" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id={mouthClip}>
        <path data-feature="mouth" d={mouths.laugh}>
          {expressions.map(pose => <animate key={pose} data-pose={pose} attributeName="d" begin="indefinite"
            dur={faceDuration} keyTimes="0;.04;.11;.27;.34;.65;.72;.93;1"
            values={[mouths.laugh, mouths.laugh, mouths.smile, mouths.smile, pose === "wink" ? mouths.wink : mouths.smile,
              pose === "wink" ? mouths.wink : mouths.smile, mouths.smile, mouths.smile, mouths.laugh].join(";")} />)}
        </path>
      </clipPath>
    </defs>
    <g className="journal-idle-face">
      <FlowerEye /><FlowerEye right />
      {[21, 67].map(x => <g key={x} transform={`translate(${x} 55) rotate(-6)`}>
        <ellipse rx="7.2" ry="3.4" fill="#f5a49a" opacity=".15">
          {expressions.map(pose => <FaceOpacity key={pose} pose={pose} from={0.15} to={1} />)}
        </ellipse>
        <path d="M-5 2l2-4 M-.5 2l2-4 M4 2l2-4" fill="none" stroke="#ef7f8a" strokeWidth="1.5" strokeLinecap="round">
          {expressions.map(pose => <FaceOpacity key={pose} pose={pose} from={1} to={0} />)}
        </path>
        <path d="M-3 1l1-2 M0 1l1-2 M3 1l1-2" fill="none" stroke="#d77379" strokeWidth=".8" strokeLinecap="round" />
      </g>)}
      <g clipPath={`url(#${mouthClip})`}>
        <rect x="33" y="47" width="22" height="22" fill="#af405a" />
        <ellipse cx="44" cy="63.5" rx="7.2" ry="5.8" fill="#ff98a6" />
      </g>
    </g>
    <WorriedFlowerFace />
  </svg>;
}

const flowerPhrases = ["哈哈！", "嘻嘻！", "加油！"] as const;
const uploadReminder = "记得交作业哦";
const eveningPhrases = [uploadReminder, ...flowerPhrases] as const;
function FlowerSpeech({ remindUpload, onReminderSpeech }: { remindUpload: boolean; onReminderSpeech: (speaking: boolean) => void }) {
  const phrases = remindUpload ? eveningPhrases : flowerPhrases;
  const nextPhrase = useRef(0);
  useEffect(() => { nextPhrase.current = 0; }, [phrases]);
  const play = useCallback((bubble: HTMLSpanElement) => {
    const phrase = phrases[nextPhrase.current];
    nextPhrase.current = (nextPhrase.current + 1) % phrases.length;
    bubble.textContent = phrase;
    const animation = animateFlowerSpeech(bubble);
    if (phrase === uploadReminder) {
      onReminderSpeech(true);
      animation.onfinish = () => onReminderSpeech(false);
    }
    return () => {
      animation.cancel();
      if (phrase === uploadReminder) onReminderSpeech(false);
    };
  }, [phrases, onReminderSpeech]);
  const speech = useIllustrationMotion(play, 4000, 7000);
  return <>
    <span ref={speech} className="journal-flower-speech"/>
    {remindUpload && <span className="journal-flower-speech journal-quiet-reminder">{uploadReminder}</span>}
  </>;
}

function animateFlowerSpeech(bubble: HTMLSpanElement) {
  return bubble.animate([
    { opacity: 0, transform: "translateY(3px) scale(.94)" },
    { opacity: 1, transform: "translateY(0) scale(1)", offset: .075 },
    { opacity: 1, offset: .925 },
    { opacity: 0, transform: "translateY(-2px)" },
  ], { duration: 2000, easing: "linear" });
}

const playedGestures = new WeakMap<SVGSVGElement, Set<Expression>>();
function chooseFlowerExpression(flower: SVGSVGElement) {
  if (flower.dataset.reminder === "speaking") return;
  const played = playedGestures.get(flower) ?? new Set<Expression>();
  if (played.size === expressions.length) played.clear();
  const choices = expressions.filter(face => !played.has(face) && face !== flower.dataset.expression);
  const pose = choices[Math.floor(Math.random() * choices.length)];
  played.add(pose);
  playedGestures.set(flower, played);
  flower.dataset.expression = pose;
  const motions = flower.querySelectorAll<SVGAnimationElement>(`[data-pose="${pose}"]`);
  motions.forEach(motion => motion.beginElement());
  const blades = flower.parentElement!.querySelectorAll<HTMLElement>(".journal-leaf-blade");
  const leaves = Array.from(blades, (blade, index) => {
    const left = index === 0;
    return blade.animate([
      { transform: "rotate(0deg)", offset: 0 },
      { transform: left ? "rotate(11deg)" : "rotate(-14deg)", offset: 0.25 },
      { transform: left ? "rotate(-5deg)" : "rotate(6deg)", offset: 0.49 },
      { transform: left ? "rotate(4deg)" : "rotate(-5deg)", offset: 0.68 },
      { transform: "rotate(0deg)", offset: 1 },
    ], { duration: 1550, delay: left ? 65 : 210, easing: "ease-in-out" });
  });
  return () => {
    motions.forEach(motion => motion.endElement());
    leaves.forEach(animation => animation.cancel());
  };
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

// Fixed lettering: each glyph keeps its own angle across renders and visits.
const mottoLines = [
  [["让", -5, ""], ["小", 0, "small"], ["小", 0, "small"], ["的", 4, ""], ["努", -6, "effort"], ["力", 5, "effort"]],
  [["开", 5, "open"], ["出", -4, "open"], ["自", -7, "own"], ["己", 8, "own"], ["的", -3, "own"], ["花", 13, "flower"]],
] as const;

export function JournalGarden({ hint, sticker, onChoose, remindUpload }: { remindUpload: boolean; hint: string; sticker: JournalSticker; onChoose: (next: JournalSticker) => void }) {
  const [open, setOpen] = useState(false);
  const [speakingReminder, setSpeakingReminder] = useState(false);
  const tools = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const flower = useIllustrationMotion(undefined, 7000, 15000);
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
      <h2 className="journal-motto" aria-label="让小小的努力，开出自己的花">
        {mottoLines.map(line => <span key={line[0][0]} className="journal-motto-line" aria-hidden="true">
          {line.map(([glyph, angle, style], index) => <span key={index}
            className={style ? `journal-motto-glyph journal-motto-${style}` : "journal-motto-glyph"}
            style={{ rotate: angle + "deg" }}>{glyph}</span>)}
        </span>)}
      </h2>
      <p className="study-next-step">{hint}</p>
      {remindUpload && <span className="visually-hidden">花花提醒：记得交今天的作业哦。</span>}
    </div>
    <div className="journal-garden-tools" ref={tools} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button type="button" className="journal-garden-trigger" ref={trigger} aria-label="装饰我的花盆" title="装饰我的花盆" aria-expanded={open} aria-controls={pickerId} onClick={() => setOpen(!open)}>
        <span className="journal-garden-decoration" role="img" aria-label={`花盆贴着${selected.label}贴纸`}>
          <span ref={flower} className="journal-flower" aria-hidden="true">
            <span className="journal-ground" />
            <FlowerSpeech remindUpload={remindUpload} onReminderSpeech={setSpeakingReminder}/>
            <span className="journal-flower-stalk">
              <span className="journal-stem" />
              {[1, 2, 3, 4, 5].map(n => <span className={`journal-petal p${n}`} key={n} />)}
              <span className="journal-flower-center" />
              <FlowerFace reminder={remindUpload ? (speakingReminder ? "speaking" : "waiting") : undefined} />
              <span className="journal-leaf"><span className="journal-leaf-blade" /></span>
              <span className="journal-leaf l2"><span className="journal-leaf-blade" /></span>
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
