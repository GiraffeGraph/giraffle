import { positionBetween, sortByPosition } from "@/domain/ids";
import { extractWikilinks } from "@/domain/links/wikilinks";
import { exportMarkdown, importMarkdown } from "@/domain/import-export/markdown";
import { compareStamp, mergeLww, tick } from "@/domain/sync/hlc";

describe("local-first domain primitives",()=>{
  test("fractional positions sort deterministically between neighbors",()=>{const first=positionBetween(null,null),second=positionBetween(first,null),middle=positionBetween(first,second);expect(sortByPosition([{id:"b",position:second},{id:"m",position:middle},{id:"a",position:first}]).map((item)=>item.id)).toEqual(["a","m","b"]);});
  test("wikilinks deduplicate while preserving display-independent targets",()=>{expect(extractWikilinks("[[Field Notes]] and [[Field Notes|notes]] then [[Map#north]]")).toEqual(["Field Notes","Map"]);});
  test("Markdown is import/export, not an authoritative store",()=>{const document=importMarkdown("# Field log\n\n- [x] Pack water\n\nObserve [[Map]]");expect(document.type).toBe("doc");expect(exportMarkdown(document)).toContain("- [x] Pack water");});
  test("HLC remains monotonic through clock rollback",()=>{expect(tick({physicalMs:100,logical:2},90)).toEqual({physicalMs:100,logical:3});});
  test("field LWW uses HLC, device, then operation ID",()=>{const old={value:"old",stamp:{clock:{physicalMs:100,logical:0},deviceId:"a",operationId:"1"}},newer={value:"new",stamp:{clock:{physicalMs:100,logical:0},deviceId:"b",operationId:"1"}};expect(compareStamp(old.stamp,newer.stamp)).toBeLessThan(0);expect(mergeLww(old,newer).value).toBe("new");});
});
