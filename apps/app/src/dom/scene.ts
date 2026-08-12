import type { CanvasElement } from "@giraffle/domain";

export interface PageReferenceRequest{pageId:string;title:string;elementId:string;versionNonce:number}
export type CanvasReferenceRequest=PageReferenceRequest;
export interface SceneViewport{scrollX:number;scrollY:number}
/** Render only live elements; stored scenes may retain deletion tombstones for convergence. */
export function liveElements(elements:readonly unknown[]):CanvasElement[]{return elements.filter((element):element is CanvasElement=>typeof element==="object"&&element!==null&&(element as{isDeleted?:unknown}).isDeleted!==true);}
export function sceneMatches(left:readonly CanvasElement[],right:readonly CanvasElement[]):boolean{if(left.length!==right.length)return false;return left.every((element,index)=>{const other=right[index];return other!==undefined&&other.id===element.id&&other.version===element.version&&other.versionNonce===element.versionNonce;});}
export function sceneViewport(appState:unknown):SceneViewport{const state=(appState??{}) as{scrollX?:unknown;scrollY?:unknown};return{scrollX:typeof state.scrollX==="number"?state.scrollX:0,scrollY:typeof state.scrollY==="number"?state.scrollY:0};}
export function pageIdForElement(element:unknown):string|null{if(typeof element!=="object"||element===null)return null;const pageId=(element as{customData?:{girafflePageId?:unknown}}).customData?.girafflePageId;return typeof pageId==="string"&&pageId.length?pageId:null;}
export function normalizeReferenceLinks(elements:readonly CanvasElement[]):CanvasElement[]{return elements.map((element)=>{const pageId=pageIdForElement(element);const link=pageId?`https://giraffle.local/page/${encodeURIComponent(pageId)}`:null;return link&&element.link!==link?{...element,link}:element;});}
/** One labelled tile for one canonical Page; tiles lay out two per row. */
export function referenceSkeleton(request:CanvasReferenceRequest,index:number):Record<string,unknown>{return{type:"rectangle",id:request.elementId,versionNonce:request.versionNonce,x:24+(index%2)*260,y:24+Math.floor(index/2)*140,width:220,height:100,roundness:{type:3},backgroundColor:"#e7f0ff",fillStyle:"solid",label:{text:request.title},link:`https://giraffle.local/page/${encodeURIComponent(request.pageId)}`,customData:{girafflePageId:request.pageId}};}
export const pageReferenceSkeleton=referenceSkeleton;
