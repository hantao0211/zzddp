"use client";
import {Gift,ShoppingBag,Castle,Clapperboard,Utensils,BookOpen,Bike,Palette,Gamepad2,Music,IceCreamBowl,Star} from "lucide-react";
import {defaultRewardIcon,type RewardIconId} from "@/domain/reward-icons";
const icons={gift:Gift,shopping:ShoppingBag,castle:Castle,movie:Clapperboard,meal:Utensils,book:BookOpen,bike:Bike,palette:Palette,game:Gamepad2,music:Music,"ice-cream":IceCreamBowl,star:Star};
export function RewardIcon({icon,title="",size=22}:{icon?:RewardIconId;title?:string;size?:number}){const Icon=icons[icon||defaultRewardIcon(title)];return <Icon size={size} aria-hidden="true"/>;}
