const UPSTREAM = "https://script.google.com/macros/s/AKfycbwLh_Vx_C00Wtm_JYCKBbBFuORd7FB5DGweunelruMtTfLkv6wx9OTwjqDa3V8D1OBPLQ/exec";
const SOURCE = "https://raw.githubusercontent.com/eirchard/quota-registration/main/index.html";
const SITE = "https://nyc-quota.muhammadeirchard-m.workers.dev";
const BASE = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","X-Frame-Options":"DENY"};
function json(value,status=200,origin="") {
  const headers = {...BASE,"Content-Type":"application/json; charset=utf-8"};
  if (origin) {headers["Access-Control-Allow-Origin"]=origin;headers["Vary"]="Origin";}
  return new Response(JSON.stringify(value),{status,headers});
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = [SITE,"https://eirchard.github.io"].includes(origin) ? origin : "";
    if (request.method === "OPTIONS") {
      if (!cors) return json({ok:false},403);
      return new Response(null,{status:204,headers:{...BASE,"Access-Control-Allow-Origin":cors,"Access-Control-Allow-Methods":"POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type","Vary":"Origin"}});
    }
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      try {
        const response = await fetch(SOURCE,{cf:{cacheTtl:30,cacheEverything:true}});
        if (!response.ok) throw new Error("Source unavailable");
        return new Response(await response.text(),{headers:{...BASE,"Content-Type":"text/html; charset=utf-8","Permissions-Policy":"camera=(), microphone=(), geolocation=()"}});
      } catch {return new Response("ระบบกำลังเตรียมแบบฟอร์ม กรุณาลองใหม่อีกครั้ง",{status:503,headers:BASE});}
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      try {
        const response = await fetch(UPSTREAM+"?api=health",{signal:AbortSignal.timeout(20000)});
        const data = await response.json();
        return json({ok:data.ok===true && data.service==="nyc-quota-api",service:"nyc-quota",storage:data.ok ? "ready" : "unavailable"},data.ok?200:503);
      } catch {return json({ok:false,storage:"unavailable"},503);}
    }
    if (url.pathname !== "/api/register") return json({ok:false},404,cors);
    if (request.method !== "POST") return json({ok:false},405,cors);
    if (origin && !cors) return json({ok:false,message:"ไม่อนุญาตคำขอจากเว็บไซต์นี้"},403);
    if (!request.headers.get("Content-Type")?.includes("application/json")) return json({ok:false,message:"รูปแบบข้อมูลไม่ถูกต้อง"},415,cors);
    try {
      if (Number(request.headers.get("Content-Length"))>16000) return json({ok:false},413,cors);
      const text = await request.text();
      if (text.length>16000) return json({ok:false,message:"ข้อมูลมีขนาดใหญ่เกินไป"},413,cors);
      const data = JSON.parse(text);
      if (data.website || typeof data.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(data.requestId)) return json({ok:false,message:"คำขอไม่ถูกต้อง"},400,cors);
      const response = await fetch(UPSTREAM,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(data),redirect:"follow",signal:AbortSignal.timeout(25000)});
      const result = await response.json();
      if (result.ok !== true) return json({ok:false,message:result.message || "บันทึกไม่สำเร็จ"},400,cors);
      if (result.receipt !== data.requestId) throw new Error("Receipt mismatch");
      return json({ok:true,receipt:result.receipt,duplicate:result.duplicate===true},200,cors);
    } catch {return json({ok:false,message:"ยังยืนยันการบันทึกไม่ได้ ข้อมูลยังอยู่ในฟอร์ม กรุณากดบันทึกอีกครั้ง"},502,cors);}
  }
};
