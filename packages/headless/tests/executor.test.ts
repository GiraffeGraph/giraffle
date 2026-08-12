import { DEFAULT_STATE_IDS, EMPTY_DOCUMENT, type Backlink, type Canvas, type ChildView, type Page, type PageCategory, type PageState, type PageStateFamily } from "@giraffle/domain";
import { describe,expect,it } from "vitest";
import { HeadlessExecutor,type HeadlessRepository,type HeadlessSnapshot } from "../index";

class FakeRepository implements HeadlessRepository{
  state:HeadlessSnapshot={pages:[],states:[
    {id:DEFAULT_STATE_IDS.forever,title:"Forever",family:"forever",color:null,icon:null,position:"a0",isDefault:true},
    {id:DEFAULT_STATE_IDS.open,title:"Open",family:"open",color:null,icon:null,position:"a1",isDefault:true},
    {id:DEFAULT_STATE_IDS.done,title:"Done",family:"done",color:null,icon:null,position:"a2",isDefault:true},
  ],categories:[],canvases:[],backlinks:[] as Backlink[]};
  private sequence=0;
  snapshot=async()=>structuredClone(this.state);
  search=async(query:string)=>this.state.pages.filter((page)=>page.title.toLowerCase().includes(query.toLowerCase())).map((page)=>({id:page.id,title:page.title,snippet:page.title}));
  async createPage(input:{title?:string;parentId?:string|null;stateId?:string;childView?:ChildView}={}){const id=this.next();this.state.pages.push(this.makePage(id,input.title??"Untitled",input.parentId??null,input.stateId??DEFAULT_STATE_IDS.forever,input.childView??"list"));return id;}
  async createCapture(title:string){let inbox=this.state.pages.find((page)=>page.title==="Inbox");if(!inbox){const id=await this.createPage({title:"Inbox"});inbox=this.page(id);}return this.createPage({title,parentId:inbox.id,stateId:DEFAULT_STATE_IDS.open});}
  async updatePage(id:string,patch:Partial<Page>){Object.assign(this.page(id),patch);}
  async saveDocument(id:string,document:Page["document"]){this.page(id).document=structuredClone(document);}
  async deletePage(id:string){this.state.pages=this.state.pages.filter((page)=>page.id!==id&&page.parentId!==id);}
  async movePage(id:string,parentId:string|null){Object.assign(this.page(id),{parentId,categoryId:null});}
  async createState(input:{title:string;family:PageStateFamily;color?:string|null;icon?:string|null}){const id=this.next();this.state.states.push({id,title:input.title,family:input.family,color:input.color??null,icon:input.icon??null,position:`b${this.sequence}`,isDefault:false});return id;}
  async updateState(id:string,patch:Partial<PageState>){Object.assign(this.state.states.find((state)=>state.id===id)!,patch);}
  async deleteState(id:string){this.state.states=this.state.states.filter((state)=>state.id!==id);}
  async createCategory(input:{parentId:string|null;title?:string;stateIdOnEnter?:string|null}){const id=this.next();this.state.categories.push({id,parentId:input.parentId,title:input.title??"Category",color:null,position:`b${this.sequence}`,stateIdOnEnter:input.stateIdOnEnter??null});return id;}
  async updateCategory(id:string,patch:Partial<PageCategory>){Object.assign(this.state.categories.find((category)=>category.id===id)!,patch);}
  async deleteCategory(id:string){this.state.categories=this.state.categories.filter((category)=>category.id!==id);}
  async createCanvas(title="New canvas"){const id=this.next();this.state.canvases.push({id,title,elements:[],appState:{},createdAt:Date.now(),updatedAt:Date.now()});return id;}
  async saveCanvas(id:string,elements:Canvas["elements"],appState:Record<string,unknown>={}){Object.assign(this.canvas(id),{elements:structuredClone(elements),appState:structuredClone(appState),updatedAt:Date.now()});}
  async renameCanvas(id:string,title:string){this.canvas(id).title=title;}
  async deleteCanvas(id:string){this.state.canvases=this.state.canvases.filter((canvas)=>canvas.id!==id);}
  private makePage(id:string,title:string,parentId:string|null,stateId:string,childView:ChildView):Page{return{id,title,icon:null,parentId,position:`b${this.sequence}`,stateId,categoryId:null,priority:null,scheduledAt:null,durationMinutes:null,description:null,childView,isPinned:false,isArchived:false,document:structuredClone(EMPTY_DOCUMENT),createdAt:Date.now(),updatedAt:Date.now()};}
  private next(){return`id-${++this.sequence}`;}
  private page(id:string){return this.state.pages.find((page)=>page.id===id)!;}
  private canvas(id:string){return this.state.canvases.find((canvas)=>canvas.id===id)!;}
}

describe("headless executor",()=>{
  it("uses one recursive Page model for knowledge and planning",async()=>{
    const repository=new FakeRepository();const executor=new HeadlessExecutor(repository);
    const parent=await executor.execute("pages_create",{title:"Giraffle",blocks:[{type:"paragraph",content:[{type:"text",text:"Private workspace"}]}]}) as{id:string};
    const child=await executor.execute("pages_create",{title:"Ship release",parentId:parent.id,stateId:DEFAULT_STATE_IDS.open,priority:"do"}) as{id:string};
    expect((await executor.execute("pages_get",{pageId:parent.id,includeArchived:false}) as{children:Page[];markdown:string}).children[0]?.id).toBe(child.id);
    expect(await executor.execute("pages_by_priority",{includeDone:false})).toMatchObject({do:[{id:child.id,title:"Ship release"}]});
  });

  it("compiles declarative graphs and preserves hand-drawn elements",async()=>{
    const repository=new FakeRepository(),executor=new HeadlessExecutor(repository);
    const page=await executor.execute("pages_create",{title:"Research"}) as{id:string};
    const canvas=await executor.execute("canvas_create",{title:"Map"}) as{id:string};
    repository.state.canvases[0]!.elements.push({id:"manual",type:"freedraw",version:1,versionNonce:1,isDeleted:false,points:[[0,0],[4,4]]});
    const first=await executor.execute("canvas_apply",{canvasId:canvas.id,mode:"merge",spec:{layout:"horizontal",nodes:[{key:"research",text:"Research",pageId:page.id,style:"primary"},{key:"idea",text:"Main idea",style:"note"}],edges:[{from:"research",to:"idea",label:"leads to"}]}}) as{managedNodes:number;managedEdges:number};
    expect(first).toMatchObject({managedNodes:2,managedEdges:1});
    const scene=repository.state.canvases[0]!.elements;
    expect(scene.some((element)=>element.id==="manual")).toBe(true);
    expect(scene.some((element)=>element.customData?.girafflePageId===page.id)).toBe(true);
    expect(scene.some((element)=>element.type==="arrow")).toBe(true);
    const second=await executor.execute("canvas_apply",{canvasId:canvas.id,mode:"merge",spec:{layout:"horizontal",nodes:[{key:"research",text:"Research",pageId:page.id,style:"primary"},{key:"idea",text:"Main idea",style:"note"}],edges:[{from:"research",to:"idea",label:"leads to"}]}}) as{created:number;updated:number};
    expect(second).toMatchObject({created:0,updated:0});
  });
});
