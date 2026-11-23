import {z} from "zod";
const TextbookSchema=z.object({version:z.string().trim().max(100).default(""),scope:z.string().trim().max(300).default("")}).strict();
export const StudentProfileSchema=z.object({grade:z.number().int().min(1).max(6),semester:z.union([z.literal(1),z.literal(2)]),region:z.string().trim().max(100).default(""),school:z.string().trim().max(120).default(""),textbooks:z.object({语文:TextbookSchema.default({version:"",scope:""}),数学:TextbookSchema.default({version:"",scope:""}),英语:TextbookSchema.default({version:"",scope:""})}).strict().default({语文:{version:"",scope:""},数学:{version:"",scope:""},英语:{version:"",scope:""}})}).strict();
export type StudentProfile=z.infer<typeof StudentProfileSchema>;
export type StudentProfileView=StudentProfile&{revision:string};
export const StudentProfileInputSchema=StudentProfileSchema.extend({revision:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
