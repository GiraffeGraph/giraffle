import { EDITOR_NODE_TYPES, isDayKey, parseDue } from "@giraffle/domain";
import { z } from "zod";

const jsonSchema:z.ZodType<unknown>=z.lazy(()=>z.union([z.string(),z.number(),z.boolean(),z.null(),z.array(jsonSchema),z.record(z.string(),jsonSchema)]));
const markSchema=z.object({type:z.string().min(1).max(80),attrs:z.record(z.string(),jsonSchema).optional()}).strict();
const textSchema=z.object({type:z.literal("text"),text:z.string().max(20_000),marks:z.array(markSchema).max(20).optional()}).strict();
export const BlockSchema:z.ZodType<unknown>=z.lazy(()=>z.object({type:z.enum(EDITOR_NODE_TYPES),attrs:z.record(z.string(),jsonSchema).optional(),content:z.array(z.union([textSchema,BlockSchema])).max(500).optional(),marks:z.array(markSchema).max(20).optional()}).strict());

const id=z.string().min(1).max(256);
const nullableId=id.nullable();
const title=z.string().min(1).max(220);
const day=z.string().refine(isDayKey, "Expected a valid YYYY-MM-DD date");
const scheduledAt=z.string().min(10).max(40).refine((value)=>parseDue(value)!==null,"Expected YYYY-MM-DD or YYYY-MM-DDTHH:mm").nullable();
const duration=z.number().int().min(1).max(1_440).nullable();
const calendarColor=z.string().regex(/^#[0-9a-f]{6}$/i).nullable();
const family=z.enum(["forever","open","done"]);
const priority=z.enum(["do","schedule","delegate","eliminate"]);
const childView=z.enum(["list","category","priority"]);
const canvasLayout=z.enum(["preserve","grid","horizontal","vertical","mindmap","radial","timeline","columns"]);
const canvasNodeStyle=z.enum(["default","primary","accent","muted","note"]);
const canvasNode=z.object({key:z.string().min(1).max(128),text:z.string().min(1).max(2_000),pageId:nullableId.optional(),style:canvasNodeStyle.optional(),x:z.number().finite().optional(),y:z.number().finite().optional(),width:z.number().finite().min(40).max(2_000).optional(),height:z.number().finite().min(40).max(2_000).optional()}).strict();
const canvasEdge=z.object({key:z.string().min(1).max(128).optional(),from:z.string().min(1).max(128),to:z.string().min(1).max(128),label:z.string().max(500).nullable().optional()}).strict();
const canvasSpec=z.object({layout:canvasLayout.default("grid"),nodes:z.array(canvasNode).max(1_000),edges:z.array(canvasEdge).max(2_000).default([])}).strict();

export interface CommandDefinition{name:string;path:readonly[string,string];summary:string;mutates:boolean;usage:string;positionals:readonly string[];inputSchema:z.ZodTypeAny}
function command(name:string,path:readonly[string,string],summary:string,mutates:boolean,usage:string,positionals:readonly string[],inputSchema:z.ZodTypeAny):CommandDefinition{return{name,path,summary,mutates,usage,positionals,inputSchema};}

export const COMMANDS:readonly CommandDefinition[]=[
  command("pages_search",["pages","search"],"Search page titles and documents.",false,"pages search <query> [--limit 20]",["query"],z.object({query:z.string().min(1).max(220),limit:z.number().int().min(1).max(50).default(20)})),
  command("pages_get",["pages","get"],"Read a page, its direct children and Markdown.",false,"pages get <page-id> [--include-archived]",["pageId"],z.object({pageId:id,includeArchived:z.boolean().default(false)})),
  command("pages_export",["pages","export"],"Render a page document as Markdown.",false,"pages export <page-id>",["pageId"],z.object({pageId:id})),
  command("pages_backlinks",["pages","backlinks"],"List pages that link to a page.",false,"pages backlinks <page-id>",["pageId"],z.object({pageId:id})),
  command("pages_children",["pages","children"],"List direct children of a page or workspace root.",false,"pages children [parent-id]",["parentId"],z.object({parentId:nullableId.default(null),includeArchived:z.boolean().default(false)})),
  command("pages_create",["pages","create"],"Create a recursive page.",true,"pages create <title> [page options]",["title"],z.object({title,parentId:nullableId.default(null),stateId:id.optional(),categoryId:nullableId.optional(),priority:priority.nullable().optional(),scheduledAt:scheduledAt.optional(),durationMinutes:duration.optional(),calendarColor:calendarColor.optional(),description:z.string().max(10_000).nullable().optional(),childView:childView.optional(),icon:z.string().max(20).nullable().optional(),isPinned:z.boolean().default(false),blocks:z.array(BlockSchema).max(200).optional()})),
  command("pages_capture",["pages","capture"],"Capture an open page in Inbox.",true,"pages capture <title>",["title"],z.object({title})),
  command("pages_update",["pages","update"],"Update page content and planning metadata.",true,"pages update <page-id> [field options]",["pageId"],z.object({pageId:id,title:title.optional(),icon:z.string().max(20).nullable().optional(),stateId:id.optional(),categoryId:nullableId.optional(),priority:priority.nullable().optional(),scheduledAt:scheduledAt.optional(),durationMinutes:duration.optional(),calendarColor:calendarColor.optional(),description:z.string().max(10_000).nullable().optional(),childView:childView.optional(),isPinned:z.boolean().optional(),isArchived:z.boolean().optional()})),
  command("pages_append",["pages","append"],"Append blocks to a page document.",true,"pages append <page-id> --blocks JSON",["pageId"],z.object({pageId:id,blocks:z.array(BlockSchema).min(1).max(100)})),
  command("pages_move",["pages","move"],"Move a page to one parent; its old category is cleared.",true,"pages move <page-id> [--parent-id ID|null] [--after-page-id ID|null]",["pageId"],z.object({pageId:id,parentId:nullableId.default(null),afterPageId:nullableId.default(null)})),
  command("pages_delete",["pages","delete"],"Delete a page and its descendants.",true,"pages delete <page-id>",["pageId"],z.object({pageId:id})),
  command("pages_scheduled",["pages","scheduled"],"List scheduled pages in an inclusive date range.",false,"pages scheduled <start-day> <end-day>",["startDay","endDay"],z.object({startDay:day,endDay:day})),
  command("pages_by_priority",["pages","priority"],"Group active pages by priority.",false,"pages priority [--include-done]",[],z.object({includeDone:z.boolean().default(false)})),

  command("states_list",["states","list"],"List custom states and semantic families.",false,"states list",[],z.object({})),
  command("states_create",["states","create"],"Create a custom state.",true,"states create <title> <family>",["title","family"],z.object({title,family,color:z.string().max(32).nullable().optional(),icon:z.string().max(20).nullable().optional()})),
  command("states_update",["states","update"],"Update a custom state.",true,"states update <state-id> [field options]",["stateId"],z.object({stateId:id,title:title.optional(),color:z.string().max(32).nullable().optional(),icon:z.string().max(20).nullable().optional(),isDefault:z.boolean().optional()})),
  command("states_delete",["states","delete"],"Delete a non-default custom state.",true,"states delete <state-id>",["stateId"],z.object({stateId:id})),

  command("categories_list",["categories","list"],"List categories owned by one page or workspace root.",false,"categories list [parent-id]",["parentId"],z.object({parentId:nullableId.default(null)})),
  command("categories_create",["categories","create"],"Create a category for direct child pages.",true,"categories create <title> [--parent-id ID|null]",["title"],z.object({title,parentId:nullableId.default(null),stateIdOnEnter:nullableId.optional()})),
  command("categories_update",["categories","update"],"Update a page-owned category.",true,"categories update <category-id> [field options]",["categoryId"],z.object({categoryId:id,title:title.optional(),color:z.string().max(32).nullable().optional(),stateIdOnEnter:nullableId.optional()})),
  command("categories_delete",["categories","delete"],"Delete a category without deleting its pages.",true,"categories delete <category-id>",["categoryId"],z.object({categoryId:id})),

  command("canvas_list",["canvas","list"],"List canvases and element counts.",false,"canvas list",[],z.object({})),
  command("canvas_get",["canvas","get"],"Read a canvas and optionally its scene.",false,"canvas get <canvas-id> [--include-elements]",["canvasId"],z.object({canvasId:id,includeElements:z.boolean().default(false)})),
  command("canvas_create",["canvas","create"],"Create an empty canvas.",true,"canvas create [title]",["title"],z.object({title:title.default("New canvas")})),
  command("canvas_apply",["canvas","apply"],"Merge a declarative graph spec into managed Excalidraw elements.",true,"canvas apply <canvas-id> --spec JSON|@FILE|- [--mode merge|replace]",["canvasId"],z.object({canvasId:id,spec:canvasSpec,mode:z.enum(["merge","replace"]).default("merge")})),
  command("canvas_add_note",["canvas","add-note"],"Add or update one managed text node without touching hand-drawn elements.",true,"canvas add-note <canvas-id> <text> --key KEY [node options]",["canvasId","text"],z.object({canvasId:id,text:z.string().min(1).max(2_000),key:z.string().min(1).max(128),style:canvasNodeStyle.default("note"),x:z.number().finite().optional(),y:z.number().finite().optional(),width:z.number().finite().min(40).max(2_000).optional(),height:z.number().finite().min(40).max(2_000).optional()})),
  command("canvas_add_page",["canvas","add-page"],"Add or update one managed node linked to a canonical Page.",true,"canvas add-page <canvas-id> <page-id> --key KEY [node options]",["canvasId","pageId"],z.object({canvasId:id,pageId:id,key:z.string().min(1).max(128),text:z.string().min(1).max(2_000).optional(),style:canvasNodeStyle.default("default"),x:z.number().finite().optional(),y:z.number().finite().optional(),width:z.number().finite().min(40).max(2_000).optional(),height:z.number().finite().min(40).max(2_000).optional()})),
  command("canvas_connect",["canvas","connect"],"Connect two managed nodes with a bound arrow and optional label.",true,"canvas connect <canvas-id> <from-key> <to-key> [--key KEY] [--label TEXT]",["canvasId","from","to"],z.object({canvasId:id,from:z.string().min(1).max(128),to:z.string().min(1).max(128),key:z.string().min(1).max(128).optional(),label:z.string().max(500).nullable().optional()})),
  command("canvas_layout",["canvas","layout"],"Lay out managed nodes deterministically while preserving manual drawings.",true,"canvas layout <canvas-id> <mode>",["canvasId","layout"],z.object({canvasId:id,layout:canvasLayout.exclude(["preserve"])})),
  command("canvas_rename",["canvas","rename"],"Rename an existing canvas.",true,"canvas rename <canvas-id> <title>",["canvasId","title"],z.object({canvasId:id,title})),
  command("canvas_delete",["canvas","delete"],"Delete an existing canvas.",true,"canvas delete <canvas-id>",["canvasId"],z.object({canvasId:id})),
];

export function findCommand(first:string,second:string):CommandDefinition|undefined{return COMMANDS.find((entry)=>entry.path[0]===first&&entry.path[1]===second);}
