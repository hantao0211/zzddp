import { z } from "zod";

export const AvatarIdSchema = z.enum(["dad", "mom", "girl", "boy", "grandpa", "grandma", "smile", "cool", "party", "clever", "starry", "love", "rabbit", "cat", "panda", "fox", "flower", "sunflower"]);
export type AvatarId = z.infer<typeof AvatarIdSchema>;
export const AvatarUpdateSchema = z.object({ avatar: AvatarIdSchema }).strict();
export const AVATARS: { id: AvatarId; label: string; group: string }[] = [
  {id:"dad",label:"爸爸",group:"家人"}, {id:"mom",label:"妈妈",group:"家人"},
  {id:"girl",label:"女孩",group:"家人"}, {id:"boy",label:"男孩",group:"家人"},
  {id:"grandpa",label:"爷爷",group:"家人"}, {id:"grandma",label:"奶奶",group:"家人"},
  {id:"smile",label:"开心笑脸",group:"心情"}, {id:"cool",label:"酷酷墨镜",group:"心情"},
  {id:"party",label:"庆祝派对",group:"心情"}, {id:"clever",label:"认真眼镜",group:"心情"},
  {id:"starry",label:"星星眼睛",group:"心情"}, {id:"love",label:"暖暖爱心",group:"心情"},
  {id:"rabbit",label:"小兔",group:"小伙伴"}, {id:"cat",label:"小猫",group:"小伙伴"},
  {id:"panda",label:"熊猫",group:"小伙伴"}, {id:"fox",label:"小狐狸",group:"小伙伴"},
  {id:"flower",label:"小花",group:"小伙伴"}, {id:"sunflower",label:"向日葵",group:"小伙伴"},
];
export function defaultAvatar(name: string, role?: string): AvatarId {
  if (/爸爸|父亲/.test(name)) return "dad";
  if (/妈妈|母亲/.test(name)) return "mom";
  if (/爷爷|外公/.test(name)) return "grandpa";
  if (/奶奶|外婆/.test(name)) return "grandma";
  return role === "child" ? "rabbit" : "smile";
}
export function avatarOption(id: unknown) { return AVATARS.find(avatar => avatar.id === id) || AVATARS.find(avatar => avatar.id === "smile")!; }
