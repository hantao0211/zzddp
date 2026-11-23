"use client";

import { useEffect, useState } from "react";
import { Flower2, Star, Sun } from "lucide-react";

const stickers = [
  { id: "flower", label: "花朵", Icon: Flower2 },
  { id: "sun", label: "太阳", Icon: Sun },
  { id: "star", label: "星星", Icon: Star },
] as const;
export type JournalSticker = typeof stickers[number]["id"];

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
  const selected = stickers.find(item => item.id === sticker)!;
  const Icon = selected.Icon;
  return <section className="journal-garden" aria-label="手帐花园">
    <span className="journal-tape-label">今天也在长大</span>
    <div className="journal-garden-copy">
      <span className="journal-eyebrow"><Sun size={16} aria-hidden="true" />新的一页，开始啦</span>
      <h2>让小小的努力，<br />开出自己的花。</h2>
      <p className="study-next-step">{hint}</p>
    </div>
    <div className="journal-garden-decoration" role="img" aria-label={`花盆贴着${selected.label}贴纸`}>
      <div className="journal-flower" aria-hidden="true">
        <span className="journal-ground" /><span className="journal-stem" />
        {[1, 2, 3, 4, 5].map(n => <span className={`journal-petal p${n}`} key={n} />)}
        <span className="journal-flower-center" /><span className="journal-leaf" /><span className="journal-leaf l2" />
        <span className="journal-book-stack" /><span className="journal-book-stack s2" />
        <span className="journal-pot" /><span className="journal-pot-label"><Icon size={16} /></span>
      </div>
    </div>
    <div className="journal-garden-tools">
      <span>装饰我的花盆</span>
      <JournalStickerPicker sticker={sticker} onChoose={onChoose} />
    </div>
  </section>;
}
