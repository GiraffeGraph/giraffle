import { createServer } from "node:net";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";

const cli = fileURLToPath(new URL("../dist/giraffle.js", import.meta.url));
const directories: string[] = [];

afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

describe("giraffle executable", () => {
  it("sends structured commands to the desktop vault runtime", async () => {
    const directory = await mkdtemp(join(tmpdir(), "giraffle-cli-e2e-")); directories.push(directory);
    const headless = join(directory, "headless"); await mkdir(headless); await writeFile(join(headless, "token"), "secret\n");
    const socket = join(headless, "control.sock");
    const request = new Promise<Record<string, unknown>>((resolve) => {
      const server = createServer((connection) => {
        let body = ""; connection.setEncoding("utf8"); connection.on("data", (chunk) => { body += chunk; if (!body.includes("\n")) return; const parsed = JSON.parse(body) as Record<string, unknown>; resolve(parsed); connection.end(`${JSON.stringify({ id: parsed.id, ok: true, data: { id: "page-1", title: "2027" } })}\n`); server.close(); });
      });
      server.listen(socket);
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const result = await runCli(["--json", "pages", "create", "2027", "--markdown", "Launch notes"], { ...process.env, GIRAFFLE_DESKTOP_DATA: directory, GIRAFFLE_PASSPHRASE: "passphrase" });
    expect(result.code, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({ ok: true, data: { id: "page-1", title: "2027" } });
    expect(await request).toMatchObject({ token: "secret", name: "pages_create", credential: "passphrase", input: { title: "2027", blocks: [{ type: "paragraph" }] } });
  });

  it("parses declarative canvas specs before sending them",async()=>{
    const directory=await mkdtemp(join(tmpdir(),"giraffle-cli-canvas-"));directories.push(directory);const headless=join(directory,"headless");await mkdir(headless);await writeFile(join(headless,"token"),"secret\n");const socket=join(headless,"control.sock");
    const request=new Promise<Record<string,unknown>>((resolve)=>{const server=createServer((connection)=>{let body="";connection.setEncoding("utf8");connection.on("data",(chunk)=>{body+=chunk;if(!body.includes("\n"))return;const parsed=JSON.parse(body) as Record<string,unknown>;resolve(parsed);connection.end(`${JSON.stringify({id:parsed.id,ok:true,data:{managedNodes:1}})}\n`);server.close();});});server.listen(socket);});await new Promise((resolve)=>setTimeout(resolve,30));
    const spec={layout:"mindmap",nodes:[{key:"root",text:"Research"}],edges:[]};const result=await runCli(["canvas","apply","canvas-1","--spec",JSON.stringify(spec),"--json"],{...process.env,GIRAFFLE_DESKTOP_DATA:directory});expect(result.code,result.stderr).toBe(0);expect(await request).toMatchObject({name:"canvas_apply",input:{canvasId:"canvas-1",spec}});
  });

  it("prints discovery without starting desktop", () => {
    const result = spawnSync(process.execPath, [cli, "commands", "--json"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).data).toHaveLength(31);
  });

  it("reports the installed desktop app", () => {
    const result = spawnSync(process.execPath, [cli, "desktop", "status", "--json"], { encoding: "utf8" });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, data: { platform: process.platform } });
  });
});

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], { env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}
