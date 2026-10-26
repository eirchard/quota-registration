/** Quota Registration V2 – Cloudflare Worker (same-origin frontend + secure API) */
const COOKIE='qr_v2_session';
const ITERATIONS=100000;
const TTL=8*60*60;
const te=new TextEncoder();
const noStore={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};

export default {
  async fetch(request,env) {
    const u=new URL(request.url);
    try {
      if(u.pathname==='/health')return json({ok:true,service:'quota-registration-v2'});
      if(u.pathname==='/api/config'&&request.method==='GET')return json({ok:true,data:await backend(env,'form.config',{})});
      if(u.pathname==='/api/setup-status'&&request.method==='GET')return json({ok:true,data:await backend(env,'setup.status',{})});
      if(u.pathname.startsWith('/api/'))return await api(request,env,u);
      if(request.method==='GET'&&(u.pathname==='/'||u.pathname==='/index.html'))return await front(env);
      return new Response('Not found',{status:404,headers:noStore});
    }catch(e) {
      console.error('Request failed:',String(e.message).slice(0,80));
      return json({ok:false,error:e.publicCode||'SERVER_ERROR'},e.status||500);
    }
  }
};

async function front(env) {
  if(!env.GITHUB_INDEX_URL)throw new Error('GITHUB_INDEX_URL missing');
  const origin=new URL(env.GITHUB_INDEX_URL);
  if(origin.protocol!=='https:'||origin.hostname!=='raw.githubusercontent.com')throw new Error('Invalid source');
  const resp=await fetch(env.GITHUB_INDEX_URL,{headers:{'Accept':'text/html'},cf:{cacheEverything:true,cacheTtl:60}});
  if(!resp.ok)return new Response('Frontend unavailable. Verify GitHub index.html.',{status:502,headers:noStore});
  const nonce=base64url(crypto.getRandomValues(new Uint8Array(18)));
  const html=(await resp.text()).replaceAll('__CSP_NONCE__',nonce);
  const csp=["default-src 'none'",`script-src 'nonce-${nonce}'`,`style-src 'nonce-${nonce}' https://fonts.googleapis.com`,'font-src https://fonts.gstatic.com',"style-src-attr 'unsafe-inline'",'img-src https: data:','connect-src \'self\'','form-action \'self\'','base-uri \'none\'','frame-ancestors \'none\''].join('; ');
  return new Response(html,{headers:{...noStore,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp,'X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()'}});
}

async function api(req,env,url) {
  const action=url.pathname.slice(5);
  if(req.method==='POST') {
    const origin=req.headers.get('Origin');
    if(origin&&origin!==url.origin)return json({ok:false,error:'BAD_ORIGIN'},403);
    const type=req.headers.get('Content-Type')||'';
    if(!type.startsWith('application/json'))return json({ok:false,error:'INVALID_INPUT'},415);
    const length=Number(req.headers.get('Content-Length')||0);
    if(length>24000)return json({ok:false,error:'TOO_LARGE'},413);
  }
  let p={};
  if(req.method==='POST') {
    try {
      const raw=await req.text();if(raw.length>24000)throw new Error('too long');
      p=JSON.parse(raw);if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('invalid');
    }catch{return json({ok:false,error:'INVALID_INPUT'},400);}
  }
  if(req.method==='POST'&&action==='submit')return json({ok:true,data:await backend(env,'form.submit',p)});
  if(req.method==='POST'&&action==='setup') {
    if(typeof env.SETUP_KEY!=='string'||!env.SETUP_KEY||!safeEqualText(p.setupCode,env.SETUP_KEY))return json({ok:false,error:'DENIED'},403);
    if(!p.password||String(p.password).length<12||String(p.password).length>128)return json({ok:false,error:'WEAK_PASSWORD'},400);
    const password=await passwordRecord(p.password);
    return json({ok:true,data:await backend(env,'setup.bootstrap',{username:p.username,displayName:p.displayName,password})});
  }
  if(req.method==='POST'&&action==='login') {
    const username=String(p.username||'').slice(0,60).toLowerCase().trim();
    const password=String(p.password||'');
    if(password.length>128||!username)return json({ok:false,error:'BAD_CREDENTIALS'},401);
    const lookup=await backend(env,'auth.lookup',{username});
    if(!lookup||lookup.locked)return json({ok:false,error:lookup?.locked?'LOCKED':'BAD_CREDENTIALS'},401);
    const computed=await derive(password,lookup.salt,lookup.iterations);
    if(!safeEqualText(computed,lookup.hash)){
      await backend(env,'auth.failed',{id:lookup.id});
      return json({ok:false,error:'BAD_CREDENTIALS'},401);
    }
    await backend(env,'auth.success',{id:lookup.id});
    const user=await backend(env,'auth.getUser',{},lookup.id);
    const cookie=await sign({uid:user.id,v:user.authVersion,exp:Math.floor(Date.now()/1000)+TTL},env.SESSION_SECRET);
    return json({ok:true,data:user},200,{'Set-Cookie':`${COOKIE}=${cookie}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${TTL}`});
  }
  if(req.method==='POST'&&action==='logout')return json({ok:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
  const user=await sessionUser(req,env);
  if(!user)return json({ok:false,error:'UNAUTHORIZED'},401);
  if(req.method==='GET'&&action==='me')return json({ok:true,data:user});
  const routes={
    'dashboard':['GET','admin.dashboard'],
    'applications':['GET','admin.applications'],
    'application-status':['POST','admin.application.status'],
    'staff':['GET','admin.staff.list'],
    'staff-create':['POST','admin.staff.create'],
    'staff-update':['POST','admin.staff.update'],
    'settings':['GET','admin.settings.get'],
    'settings-update':['POST','admin.settings.update']
  };
  const route=routes[action];
  if(!route||req.method!==route[0])return json({ok:false,error:'NOT_FOUND'},404);
  if(action==='staff-create'||action==='staff-update'){
    if(p.password){
      if(String(p.password).length<12||String(p.password).length>128)return json({ok:false,error:'WEAK_PASSWORD'},400);
      p.password=await passwordRecord(p.password);
    }
  }
  return json({ok:true,data:await backend(env,route[1],p,user.id)});
}

async function backend(env,action,payload,actorId='') {
  if(!env.GAS_ENDPOINT||!env.BACKEND_SECRET)throw new Error('Backend secrets missing');
  const endpoint=new URL(env.GAS_ENDPOINT);
  if(endpoint.protocol!=='https:'||endpoint.hostname!=='script.google.com'||!endpoint.pathname.endsWith('/exec'))throw new Error('Invalid GAS endpoint');
  const resp=await fetch(endpoint.toString(),{
    method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},
    body:JSON.stringify({secret:env.BACKEND_SECRET,action,payload,actorId}),redirect:'follow'
  });
  if(!resp.ok)throw Object.assign(new Error('GAS HTTP '+resp.status),{status:502});
  let result;try{result=await resp.json();}catch{throw Object.assign(new Error('GAS response is not JSON; check deployment access'),{status:502});}
  if(!result.ok){
    const code=result.error||'SERVER_ERROR';
    const status=['FORBIDDEN','DENIED'].includes(code)?403:code==='NOT_FOUND'?404:code==='CLOSED'?409:code==='OWNER_EXISTS'?409:400;
    throw Object.assign(new Error(code),{publicCode:code,status});
  }
  return result.data;
}

async function sessionUser(req,env){
  const cookie=(req.headers.get('Cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='));
  if(!cookie||!env.SESSION_SECRET)return null;
  const t=cookie.substring(COOKIE.length+1);const chunks=t.split('.');if(chunks.length!==2)return null;
  const good=await hmac(chunks[0],env.SESSION_SECRET);
  if(!safeEqualText(chunks[1],good))return null;
  let claims;try{claims=JSON.parse(new TextDecoder().decode(fromBase64url(chunks[0])));}catch{return null;}
  if(!claims||!claims.uid||!claims.exp||claims.exp<Math.floor(Date.now()/1000))return null;
  try {
    const user=await backend(env,'auth.getUser',{},claims.uid);
    if(user.authVersion!==claims.v||user.active!==true)return null;
    return user;
  }catch{return null;}
}
async function sign(claims,secret){const data=base64url(te.encode(JSON.stringify(claims)));return data+'.'+await hmac(data,secret);}
async function hmac(data,secret){const key=await crypto.subtle.importKey('raw',te.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return base64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,te.encode(data))));}
async function passwordRecord(password){const salt=base64url(crypto.getRandomValues(new Uint8Array(24)));return {salt,hash:await derive(password,salt,ITERATIONS),iterations:ITERATIONS};}
async function derive(password,salt,iterations){
  const key=await crypto.subtle.importKey('raw',te.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:te.encode(salt),iterations,hash:'SHA-256'},key,256);
  return Array.from(new Uint8Array(bits)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
function safeEqualText(a,b){const x=te.encode(String(a??'')),y=te.encode(String(b??''));let diff=x.length^y.length;for(let i=0;i<Math.max(x.length,y.length);i++)diff|=(x[i]||0)^(y[i]||0);return diff===0;}
function base64url(bytes){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function fromBase64url(t){const s=t.replace(/-/g,'+').replace(/_/g,'/');const str=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(str,c=>c.charCodeAt(0));}
function json(value,status=200,extra={}){return new Response(JSON.stringify(value),{status,headers:{...noStore,'Content-Type':'application/json; charset=utf-8',...extra}});}