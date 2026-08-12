import { blocksToMarkdown, sortByPosition, type Backlink, type BlockNodeContent, type Canvas, type ChildView, type Page, type PageCategory, type PageState, type PageStateFamily } from "@giraffle/domain";
import { addCanvasNode,applyCanvasSpec,connectCanvasNodes,layoutCanvas,type CanvasSpec } from "./canvas";
import { COMMANDS } from "./commands";
import { invalid,notFound,WorkspaceError } from "./errors";

export interface HeadlessSnapshot{pages:Page[];states:PageState[];categories:PageCategory[];canvases:Canvas[];backlinks:Backlink[]}
export interface HeadlessRepository{
  snapshot():Promise<HeadlessSnapshot>;search(query:string):Promise<{id:string;title:string;snippet:string}[]>;
  createPage(input?:{title?:string;parentId?:string|null;stateId?:string;childView?:ChildView}):Promise<string>;
  createCapture(title:string):Promise<string>;
  updatePage(id:string,patch:Partial<Pick<Page,"title"|"icon"|"stateId"|"categoryId"|"priority"|"scheduledAt"|"durationMinutes"|"description"|"childView"|"isPinned"|"isArchived">>):Promise<void>;
  saveDocument(pageId:string,document:Page["document"]):Promise<void>;deletePage(id:string):Promise<void>;movePage(id:string,parentId:string|null,afterPageId?:string|null):Promise<void>;
  createState(input:{title:string;family:PageStateFamily;color?:string|null;icon?:string|null}):Promise<string>;updateState(id:string,patch:Partial<Pick<PageState,"title"|"color"|"icon"|"isDefault">>):Promise<void>;deleteState(id:string):Promise<void>;
  createCategory(input:{parentId:string|null;title?:string;stateIdOnEnter?:string|null}):Promise<string>;updateCategory(id:string,patch:Partial<Pick<PageCategory,"title"|"color"|"stateIdOnEnter">>):Promise<void>;deleteCategory(id:string):Promise<void>;
  createCanvas(title?:string):Promise<string>;saveCanvas(id:string,elements:Canvas["elements"],appState?:Record<string,unknown>):Promise<void>;renameCanvas(id:string,title:string):Promise<void>;deleteCanvas(id:string):Promise<void>;
}

type Input=Record<string,unknown>;
export class HeadlessExecutor{
  constructor(private readonly repository:HeadlessRepository){}
  async execute(name:string,rawInput:unknown):Promise<unknown>{const definition=COMMANDS.find((entry)=>entry.name===name);if(!definition)invalid(`Unknown command: ${name}`);const parsed=definition.inputSchema.safeParse(rawInput);if(!parsed.success)throw new WorkspaceError("INVALID_INPUT",parsed.error.issues.map((issue)=>`${issue.path.join(".")||"input"}: ${issue.message}`).join("; "));return this.dispatch(name,parsed.data as Input);}
  private async dispatch(name:string,input:Input):Promise<unknown>{
    switch(name){
      case"pages_search":return(await this.repository.search(input.query as string)).slice(0,input.limit as number);
      case"pages_get":return this.pageGet(input.pageId as string,input.includeArchived as boolean);
      case"pages_export":return this.pageExport(input.pageId as string);
      case"pages_backlinks":return this.pageBacklinks(input.pageId as string);
      case"pages_children":return this.pageChildren(input.parentId as string|null,input.includeArchived as boolean);
      case"pages_create":return this.pageCreate(input);
      case"pages_capture":{const id=await this.repository.createCapture(input.title as string);return this.pageMetadata(id);}
      case"pages_update":return this.pageUpdate(input);
      case"pages_append":return this.pageAppend(input.pageId as string,input.blocks as BlockNodeContent[]);
      case"pages_move":await this.repository.movePage(input.pageId as string,input.parentId as string|null,input.afterPageId as string|null);return this.pageMetadata(input.pageId as string);
      case"pages_delete":await this.repository.deletePage(input.pageId as string);return{deleted:input.pageId};
      case"pages_scheduled":return this.pagesScheduled(input.startDay as string,input.endDay as string);
      case"pages_by_priority":return this.pagesByPriority(input.includeDone as boolean);
      case"states_list":return(await this.snapshot()).states;
      case"states_create":{const id=await this.repository.createState({title:input.title as string,family:input.family as PageStateFamily,...optionalPatch(input,["color","icon"])});return this.stateById(id);}
      case"states_update":await this.repository.updateState(input.stateId as string,optionalPatch(input,["title","color","icon","isDefault"]));return this.stateById(input.stateId as string);
      case"states_delete":await this.repository.deleteState(input.stateId as string);return{deleted:input.stateId};
      case"categories_list":return sortByPosition((await this.snapshot()).categories.filter((category)=>category.parentId===(input.parentId as string|null)));
      case"categories_create":{const id=await this.repository.createCategory({parentId:input.parentId as string|null,title:input.title as string,...(input.stateIdOnEnter!==undefined?{stateIdOnEnter:input.stateIdOnEnter as string|null}:{})});return this.categoryById(id);}
      case"categories_update":await this.repository.updateCategory(input.categoryId as string,optionalPatch(input,["title","color","stateIdOnEnter"]));return this.categoryById(input.categoryId as string);
      case"categories_delete":await this.repository.deleteCategory(input.categoryId as string);return{deleted:input.categoryId};
      case"canvas_list":return this.canvasList();
      case"canvas_get":return this.canvasGet(input.canvasId as string,input.includeElements as boolean);
      case"canvas_create":{const id=await this.repository.createCanvas(input.title as string);return this.canvasById(id);}
      case"canvas_apply":return this.canvasApply(input.canvasId as string,input.spec as CanvasSpec,input.mode as "merge"|"replace");
      case"canvas_add_note":return this.canvasAddNote(input);
      case"canvas_add_page":return this.canvasAddPage(input);
      case"canvas_connect":return this.canvasConnect(input);
      case"canvas_layout":return this.canvasLayout(input.canvasId as string,input.layout as "grid"|"horizontal"|"vertical"|"mindmap"|"radial"|"timeline"|"columns");
      case"canvas_rename":await this.repository.renameCanvas(input.canvasId as string,input.title as string);return this.canvasById(input.canvasId as string);
      case"canvas_delete":await this.repository.deleteCanvas(input.canvasId as string);return{deleted:input.canvasId};
      default:return invalid(`Command is not implemented: ${name}`);
    }
  }
  private snapshot(){return this.repository.snapshot();}
  private async pageById(id:string){return(await this.snapshot()).pages.find((page)=>page.id===id)??notFound("Page",id);}
  private async stateById(id:string){return(await this.snapshot()).states.find((state)=>state.id===id)??notFound("State",id);}
  private async categoryById(id:string){return(await this.snapshot()).categories.find((category)=>category.id===id)??notFound("Category",id);}
  private async canvasById(id:string){return(await this.snapshot()).canvases.find((canvas)=>canvas.id===id)??notFound("Canvas",id);}
  private async pageMetadata(id:string){const{document,...metadata}=await this.pageById(id);return metadata;}
  private async pageGet(id:string,includeArchived:boolean){const snapshot=await this.snapshot();const page=snapshot.pages.find((item)=>item.id===id)??notFound("Page",id);if(page.isArchived&&!includeArchived)notFound("Page",id);const{document,...metadata}=page;return{metadata,document,children:sortByPosition(snapshot.pages.filter((child)=>child.parentId===id&&!child.isArchived)).map(({document:_document,...child})=>child),markdown:blocksToMarkdown(document)};}
  private async pageExport(id:string){const page=await this.pageById(id);return{pageId:id,title:page.title,markdown:blocksToMarkdown(page.document)};}
  private async pageBacklinks(id:string){const snapshot=await this.snapshot();if(!snapshot.pages.some((page)=>page.id===id))notFound("Page",id);return snapshot.backlinks.filter((link)=>link.targetPageId===id);}
  private async pageChildren(parentId:string|null,includeArchived:boolean){const pages=(await this.snapshot()).pages;if(parentId&&!pages.some((page)=>page.id===parentId))notFound("Page",parentId);return sortByPosition(pages.filter((page)=>page.parentId===parentId&&(includeArchived||!page.isArchived))).map(({document:_document,...page})=>page);}
  private async pageCreate(input:Input){const id=await this.repository.createPage({title:input.title as string,parentId:input.parentId as string|null,...optionalPatch(input,["stateId","childView"])});try{const patch=optionalPatch(input,["icon","categoryId","priority","scheduledAt","durationMinutes","description","isPinned"]);if(Object.keys(patch).length)await this.repository.updatePage(id,patch);if(input.blocks)await this.repository.saveDocument(id,{type:"doc",content:input.blocks as BlockNodeContent[]});return await this.pageMetadata(id);}catch(cause){await this.repository.deletePage(id).catch(()=>undefined);throw cause;}}
  private async pageUpdate(input:Input){await this.repository.updatePage(input.pageId as string,optionalPatch(input,["title","icon","stateId","categoryId","priority","scheduledAt","durationMinutes","description","childView","isPinned","isArchived"]));return this.pageMetadata(input.pageId as string);}
  private async pageAppend(id:string,blocks:BlockNodeContent[]){const page=await this.pageById(id);await this.repository.saveDocument(id,{...page.document,content:[...page.document.content,...blocks]});return{pageId:id,appended:blocks.length,markdown:blocksToMarkdown((await this.pageById(id)).document)};}
  private async pagesScheduled(start:string,end:string){if(start>end)invalid("startDay must not be after endDay");return(await this.snapshot()).pages.filter((page)=>{const day=page.scheduledAt?.slice(0,10);return!page.isArchived&&day&&day>=start&&day<=end;}).sort((a,b)=>(a.scheduledAt??"").localeCompare(b.scheduledAt??"")||a.position.localeCompare(b.position));}
  private async pagesByPriority(includeDone:boolean){const snapshot=await this.snapshot();const doneIds=new Set(snapshot.states.filter((state)=>state.family==="done").map((state)=>state.id));const pages=snapshot.pages.filter((page)=>!page.isArchived&&(includeDone||!doneIds.has(page.stateId)));return Object.fromEntries(["do","schedule","delegate","eliminate","unassigned"].map((value)=>[value,sortByPosition(pages.filter((page)=>(page.priority??"unassigned")===value))]));}
  private async canvasList(){return[...(await this.snapshot()).canvases].sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)).map(({elements,appState:_appState,...canvas})=>({...canvas,elementCount:elements.filter((element)=>!element.isDeleted).length}));}
  private async saveCanvasResult(canvas:Canvas,result:ReturnType<typeof applyCanvasSpec>){if(result.created||result.updated||result.deleted)await this.repository.saveCanvas(canvas.id,result.elements,canvas.appState);const{elements:_elements,...summary}=result;return{canvasId:canvas.id,...summary,elementCount:result.elements.filter((element)=>!element.isDeleted).length};}
  private async canvasApply(id:string,spec:CanvasSpec,mode:"merge"|"replace"){const snapshot=await this.snapshot(),canvas=snapshot.canvases.find((item)=>item.id===id)??notFound("Canvas",id);return this.saveCanvasResult(canvas,applyCanvasSpec({canvasId:id,elements:canvas.elements,pages:snapshot.pages,spec,mode}));}
  private async canvasAddNote(input:Input){const snapshot=await this.snapshot(),id=input.canvasId as string,canvas=snapshot.canvases.find((item)=>item.id===id)??notFound("Canvas",id);return this.saveCanvasResult(canvas,addCanvasNode({canvasId:id,elements:canvas.elements,pages:snapshot.pages,node:{key:input.key as string,text:input.text as string,style:input.style as "note",...optionalPatch(input,["x","y","width","height"])}}));}
  private async canvasAddPage(input:Input){const snapshot=await this.snapshot(),id=input.canvasId as string,pageId=input.pageId as string,canvas=snapshot.canvases.find((item)=>item.id===id)??notFound("Canvas",id),page=snapshot.pages.find((item)=>item.id===pageId)??notFound("Page",pageId);return this.saveCanvasResult(canvas,addCanvasNode({canvasId:id,elements:canvas.elements,pages:snapshot.pages,node:{key:input.key as string,text:typeof input.text==="string"?input.text:page.title,pageId,style:input.style as "default",...optionalPatch(input,["x","y","width","height"])}}));}
  private async canvasConnect(input:Input){const snapshot=await this.snapshot(),id=input.canvasId as string,canvas=snapshot.canvases.find((item)=>item.id===id)??notFound("Canvas",id);return this.saveCanvasResult(canvas,connectCanvasNodes({canvasId:id,elements:canvas.elements,pages:snapshot.pages,edge:{from:input.from as string,to:input.to as string,...optionalPatch(input,["key","label"])}}));}
  private async canvasLayout(id:string,mode:"grid"|"horizontal"|"vertical"|"mindmap"|"radial"|"timeline"|"columns"){const canvas=await this.canvasById(id);return this.saveCanvasResult(canvas,layoutCanvas({canvasId:id,elements:canvas.elements,mode}));}
  private async canvasGet(id:string,includeElements:boolean){const canvas=await this.canvasById(id);const{elements,appState,...metadata}=canvas;const result={...metadata,elementCount:elements.filter((element)=>!element.isDeleted).length};return includeElements?{...result,elements,appState}:result;}
}
function optionalPatch<T extends Input>(input:T,keys:readonly string[]):Record<string,never>{return Object.fromEntries(keys.filter((key)=>input[key]!==undefined).map((key)=>[key,input[key]])) as Record<string,never>;}
