import {z} from "zod";
export const REWARD_ICONS = [
 {id:"gift",label:"礼物"},{id:"shopping",label:"购物袋"},{id:"castle",label:"城堡"},
 {id:"movie",label:"电影"},{id:"meal",label:"美食"},{id:"book",label:"书本"},
 {id:"bike",label:"骑行"},{id:"palette",label:"画画"},{id:"game",label:"游戏"},
 {id:"music",label:"音乐"},{id:"ice-cream",label:"冰淇淋"},{id:"star",label:"星星"}
] as const;
export const RewardIconSchema=z.enum(REWARD_ICONS.map(v=>v.id));
export type RewardIconId=z.infer<typeof RewardIconSchema>;
export const RewardIconInputSchema=z.object({icon:RewardIconSchema}).strict();
export function defaultRewardIcon(title:string):RewardIconId {
 if(/迪士尼|乐园/.test(title))return "castle";
 if(/电影/.test(title))return "movie";
 if(/餐|美食/.test(title))return "meal";
 if(/购物/.test(title))return "shopping";
 if(/书|阅读/.test(title))return "book";
 return "gift";
}
