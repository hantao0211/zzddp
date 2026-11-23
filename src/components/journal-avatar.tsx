import type { ReactNode } from "react";
import type { AvatarId } from "@/domain/avatars";

// Original journal portraits. Shared proportions, ink and paper colors keep every
// character recognizable at header size without relying on a device emoji font.
const ink = "#684c55", hair = "#74565b", skin = "#f6dfc9", paper = "#fff5e7";
const pink = "#df98aa", rose = "#bf6b84", sage = "#9eb69a", leaf = "#69866e", gold = "#e6bf77", lilac = "#bcaacf";
const line = { stroke: ink, strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const dot = (x: number, y: number) => <ellipse cx={x} cy={y} rx="1.65" ry="2.15" fill={ink} />;
function Cheeks({ y = 46 }: { y?: number }) { return <g fill={pink} opacity=".65"><ellipse cx="25" cy={y} rx="4.3" ry="2.2" /><ellipse cx="55" cy={y} rx="4.3" ry="2.2" /></g>; }
function Smile({ y = 48 }: { y?: number }) { return <path d={`M35 ${y}q5 5 10 0`} {...line} fill="none" />; }
function Eyes({ y = 39 }: { y?: number }) { return <>{dot(31, y)}{dot(49, y)}</>; }
function Sprout() { return <g><path d="M40 24V13" stroke={leaf} strokeWidth="2" strokeLinecap="round" /><path d="M40 18c-10 0-12-8-12-8 10-2 14 4 12 8" fill={sage} /><path d="M40 15c0-9 10-11 10-11 3 9-5 12-10 11" fill={leaf} /></g>; }
function FlowerClip({ x = 55, y = 23 }: { x?: number; y?: number }) { return <g transform={`translate(${x} ${y})`}><path d="M0-5c4-4 8 0 5 4 5 2 2 8-2 5-2 5-8 2-5-2-5-2-2-8 2-5Z" fill={pink} /><circle r="2" fill={gold} /></g>; }
function Glasses({ y = 40 }: { y?: number }) { return <g fill="none" {...line}><circle cx="30" cy={y} r="7" /><circle cx="50" cy={y} r="7" /><path d={`M37 ${y}h6M20 ${y - 2}h3M57 ${y - 2}h3`} /></g>; }
function Family({ id }: { id: AvatarId }) {
  const older = id === "grandpa" || id === "grandma";
  const hairColor = older ? "#b7b5b0" : hair;
  let back: ReactNode = null, front: ReactNode = null;
  if (id === "mom") {
    back = <path d="M16 38c-2-20 8-29 24-29s27 12 24 31l-1 24H16Z" fill={hairColor} />;
    front = <><path d="M20 32c0-18 29-23 37-3-13 1-22-1-27-8-1 8-5 11-10 11Z" fill={hairColor} /><FlowerClip x={58} y={26} /></>;
  } else if (id === "girl") {
    back = <g fill={hairColor}><path d="M20 31C9 29 7 42 12 56c0-9 9-7 13-9M60 31c11-2 13 11 8 25 0-9-9-7-13-9" /><path d="M17 32C14 16 26 10 40 10s26 9 23 23Z" /></g>;
    front = <><path d="M20 31c5-1 9-5 11-11 6 8 17 10 29 9v-7C48 9 27 10 21 23Z" fill={hairColor} /><path d="m18 32-7-5 1 9 6-4 6 5 1-9Z" fill={lilac} /><FlowerClip x={60} y={29} /></>;
  } else if (id === "grandma") {
    back = <><circle cx="40" cy="12" r="10" fill={hairColor} /><path d="M17 35c-2-20 11-25 23-25s25 8 23 25Z" fill={hairColor} /></>;
    front = <><path d="M20 29c9 0 17-4 20-11 5 8 12 11 20 11-1-14-12-19-20-19S20 15 20 29Z" fill={hairColor} /><Glasses /><g fill={gold}><circle cx="19" cy="43" r="2" /><circle cx="61" cy="43" r="2" /></g></>;
  } else if (id === "grandpa") {
    back = <path d="M16 35C12 17 25 11 40 11s28 9 24 25l-7-3-1-11c-10-5-22-4-31 1l-2 10Z" fill={hairColor} />;
    front = <><Glasses /><path d="M31 48q5-7 9-2 5-5 9 2-4 5-9 0-5 5-9 0" fill={hairColor} /></>;
  } else if (id === "dad") {
    back = <path d="M17 34c-7-14 3-24 15-22 9-7 27-3 31 8l-2 17-7-5-27-8-4 12Z" fill={hairColor} />;
    front = <>
      <path d="M18 27C17 15 25 7 38 7s24 8 24 22l-18-4Z" fill={sage} />
      <circle cx="38" cy="7" r="2" fill={leaf} />
      <path d="M38 9c7 3 11 9 11 16" stroke={leaf} strokeWidth="1.3" strokeLinecap="round" opacity=".65" />
      <path d="m27 19 3-5 4 5" stroke={paper} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 26c14-5 31-4 44 0l9 5c2 2-5 4-11 3l-17-6c-9-1-17 0-25 1Z" fill={leaf} />
      <path d="m27 33 7-1m12 0 7 1" {...line} />
      <path d="M35 47q5-4 10 0" stroke={hairColor} strokeWidth="2.8" strokeLinecap="round" />
    </>;
  } else {
    back = <path d="M17 35c-5-12 3-23 12-22 9-8 26-5 31 5l3 16Z" fill={hairColor} />;
    front = <path d="M19 29c9 0 13-2 18-8-1 5 4 9 10 9l-2-7c5 5 9 6 15 6l-3-14-28-3-10 9Z" fill={hairColor} />;
  }
  const shirt = id === "girl" || id === "grandma" ? pink : id === "mom" ? lilac : sage;
  return <>{back}<path d="M14 77c0-15 9-23 26-23s26 8 26 23" fill={shirt} /><path d="m31 57 9 8 9-8" fill={paper} /><path d="M35 52v8q5 5 10 0v-8" fill={skin} /><ellipse cx="40" cy="35" rx="21" ry="23" fill={skin} /><g fill={skin}><ellipse cx="19" cy="38" rx="3.5" ry="5" /><ellipse cx="61" cy="38" rx="3.5" ry="5" /></g><Eyes /><Cheeks /><Smile y={id === "dad" || id === "grandpa" ? 51 : 48} />{front}{id === "girl" && <g stroke={paper} strokeWidth="2"><path d="M27 63v13m26-13v13" /></g>}{id === "dad" && <path d="m53 65 2 3 3-1-1 3 2 2-4 1-2-2Z" fill={paper} />}</>;
}
function Mood({ id }: { id: AvatarId }) {
  return <><path d="M16 51c-4-15 3-29 24-29s28 14 24 29c-2 11-10 17-24 17s-22-6-24-17Z" fill={id === "love" ? "#f6dfe2" : paper} /><Cheeks y={50} />
    {id === "party" ? <><path d="m29 24 8-20 12 19Z" fill={gold} /><path d="m34 12 9 4m-12 6 15-1" stroke={rose} strokeWidth="2.5" /><circle cx="37" cy="5" r="2.5" fill={pink} /><path d="m10 27 3 4m52-11-3 4m6 19 4-1" stroke={sage} strokeWidth="3" strokeLinecap="round" /></> : <Sprout />}
    {id === "cool" ? <g><path d="M21 39h16v8q-8 8-16-1Zm22 0h16v7q-8 9-16 1Z" fill={leaf} /><path d="M37 42h6M18 39h44" {...line} /><path d="m25 42 4 5m19-5 4 5" stroke={paper} opacity=".55" strokeWidth="2" /></g> : id === "starry" ? <g fill={gold} stroke={rose} strokeWidth="1"><path d="m29 35 2.5 5 5 2-5 2-2.5 5-2-5-5-2 5-2Zm22 0 2 5 5 2-5 2-2 5-2.5-5-5-2 5-2Z" /></g> : id === "love" ? <><g fill="none" {...line}><path d="M25 42q5-6 10 0m10 0q5-6 10 0" /></g><path d="M58 32c-8-6-6-13-1-10 4-7 11-1 1 10Z" fill={rose} /></> : <Eyes y={43} />}
    {id === "clever" && <Glasses y={43} />}
    {id === "party" || id === "starry" ? <path d="M34 52h12q-1 10-6 10t-6-10" fill={rose} /> : <Smile y={54} />}
    <path d="M28 69q12 5 24 0" stroke={sage} strokeWidth="4" strokeLinecap="round" />
  </>;
}
function Animal({ id }: { id: AvatarId }) {
  if (id === "rabbit") return <><path d="M24 34C9 8 27-3 33 29M46 29C47-3 69 8 56 35" fill={paper} {...line} strokeWidth="1.3" /><path d="M27 28c-7-16-7-19-4-19 4-1 7 11 7 19m21 0c2-17 7-22 9-18 1 4-2 11-6 18" fill={pink} /><path d="M17 52c-3-17 7-26 23-26s26 9 23 26c-2 12-11 18-23 18S19 64 17 52" fill={paper} /><Eyes y={46} /><Cheeks y={52} /><path d="m37 51 3 3 3-3Z" fill={rose} /><path d="M40 54v3m-5-1q2 5 5 1 3 4 5-1" {...line} /><path d="m25 68 13 4-11 5Zm17 4 13-4-2 9Z" fill={sage} /><circle cx="40" cy="72" r="3" fill={leaf} /></>;
  if (id === "cat") return <><path d="m18 36-2-22 21 13h7l20-13-2 23c11 25-2 34-22 34S8 59 18 36" fill="#f2d6bb" /><path d="m20 31-1-10 11 8m21 0 10-8-1 11" fill={pink} /><path d="M39 26v8m-7-5 2 7m13-7-2 7" stroke={hair} strokeWidth="3" strokeLinecap="round" /><Eyes y={44} /><Cheeks y={51} /><path d="m37 49 3 3 3-3Z" fill={rose} /><path d="M40 52v3m-5-1q2 5 5 1 3 4 5-1m-21-6-9-2m9 8-9 1m41-7 9-2m-9 8 9 1" {...line} strokeWidth="1.5" /><FlowerClip x={60} y={29} /></>;
  if (id === "panda") return <><g fill={hair}><circle cx="21" cy="24" r="10" /><circle cx="59" cy="24" r="10" /></g><ellipse cx="40" cy="46" rx="27" ry="25" fill={paper} /><g fill={hair}><ellipse cx="29" cy="42" rx="7" ry="9" transform="rotate(24 29 42)" /><ellipse cx="51" cy="42" rx="7" ry="9" transform="rotate(-24 51 42)" /></g><g fill={paper}><circle cx="30" cy="41" r="2" /><circle cx="50" cy="41" r="2" /></g><Cheeks y={54} /><path d="M37 52q3-3 6 0l-3 3Z" fill={ink} /><Smile y={58} /><path d="m50 21 7-9" stroke={leaf} strokeWidth="2" /><path d="M53 18c-9 0-9-7-9-7 10-2 12 3 9 7m1-2c1-9 9-9 9-9 2 9-4 12-9 9" fill={sage} /></>;
  return <><path d="m15 36 1-26 23 16 23-16 3 26c6 21-6 31-25 36C20 67 8 57 15 36" fill="#dca687" /><path d="m20 29-1-11 12 10m18 0 11-10-1 12" fill={pink} /><path d="M14 41c14-3 20 6 26 13 6-7 12-16 26-13-2 15-14 24-26 26-12-2-24-11-26-26" fill={paper} /><Eyes y={40} /><Cheeks y={51} /><path d="m36 53 4 4 4-4Z" fill={ink} /><Smile y={59} /><path d="m26 70 14 4 14-4" stroke={sage} strokeWidth="5" strokeLinecap="round" /></>;
}
function Bloom({ id }: { id: AvatarId }) {
  const sunflower = id === "sunflower";
  return <><path d="M40 74V52" stroke={leaf} strokeWidth="3" strokeLinecap="round" /><path d="M39 68c-14 1-18-10-18-10 14-3 19 4 18 10m3-6c0-13 17-16 17-16 0 13-10 18-17 16" fill={sage} />
    <g fill={sunflower ? gold : pink}>{Array.from({ length: sunflower ? 10 : 5 }, (_, i) => <ellipse key={i} cx="40" cy={sunflower ? 17 : 18} rx={sunflower ? 7 : 12} ry={sunflower ? 12 : 15} transform={`rotate(${i * (sunflower ? 36 : 72)} 40 34)`} />)}</g>
    <circle cx="40" cy="34" r={sunflower ? 17 : 15} fill={sunflower ? "#f3dfb5" : paper} /><g fill={ink}><circle cx="34" cy="32" r="1.5" /><circle cx="46" cy="32" r="1.5" /></g><g fill={rose} opacity=".5"><ellipse cx="30" cy="38" rx="3" ry="1.5" /><ellipse cx="50" cy="38" rx="3" ry="1.5" /></g><path d="M36 39q4 4 8 0" {...line} /></>;
}
export function JournalAvatar({ id, className = "" }: { id: AvatarId; className?: string }) {
  const family = ["dad", "mom", "girl", "boy", "grandpa", "grandma"].includes(id);
  const mood = ["smile", "cool", "party", "clever", "starry", "love"].includes(id);
  return <svg className={`journal-avatar ${className}`} viewBox="0 0 80 80" fill="none" aria-hidden="true" focusable="false">{family ? <Family id={id} /> : mood ? <Mood id={id} /> : id === "flower" || id === "sunflower" ? <Bloom id={id} /> : <Animal id={id} />}</svg>;
}
