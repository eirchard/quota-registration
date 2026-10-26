/**
 * Quota Registration V2 – Google Sheets backend
 * Deploy as Web app: Execute as Me, Anyone.
 * Run setupSystem() once, then set Script Properties: SHEET_ID, BACKEND_SECRET.
 * Never publish the secret or this GAS backend logic in a public GitHub repository.
 */
const V2 = {
  staging: true,
  applications: 'QRV21_Applications',
  staff: 'QRV21_Staff',
  settings: 'QRV21_Settings',
  audit: 'QRV21_Audit',
  headers: {
    QRV21_Applications: ['id','submittedAt','prefix','firstName','lastName','phone','previousSchool','gpa','level','major','note','status','updatedAt','address','district','amphoe','province','zipcode','guardianName','relationship','guardianPhone','revision','consentVersion','idempotencyKey'],
    QRV21_Staff: ['id','username','displayName','role','active','passwordSalt','passwordHash','iterations','failedAttempts','lockedUntil','authVersion','createdAt','updatedAt'],
    QRV21_Settings: ['key','value','updatedAt'],
    QRV21_Audit: ['at','actorId','action','targetId','description'],
    QRV21_ApplicationHistory: ['at','applicationId','actorId','oldStatus','newStatus','note']
  },
  defaults: {
    schoolName: 'วิทยาลัยการอาชีพนครยะลา',
    admissionYear: '2569',
    admissionTitle: 'ลงทะเบียนสมัครเรียนรอบโควตา',
    welcomeMessage: 'กรอกข้อมูลเพื่อสมัครเรียนและติดตามประกาศจากสถานศึกษา',
    admissionsOpen: 'false',
    majors: 'เทคโนโลยีธุรกิจดิจิทัล',
    privacyNotice: 'ข้อมูลที่ส่งจะใช้ในการดำเนินงานรับสมัครเรียน ผู้มีสิทธิ์เข้าถึงคือเจ้าหน้าที่ที่ได้รับมอบหมาย'
  }
};

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok:true, service:'Quota Registration V2 API' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupSystem() {
  const ss = db_();
  if (!/STAGING|TEST|ทดสอบ/i.test(ss.getName())) throw new Error('Use an isolated spreadsheet named STAGING or TEST only');
  Object.keys(V2.headers).forEach(name => {
    let ws = ss.getSheetByName(name);
    if (!ws) ws = ss.insertSheet(name);
    if (ws.getLastRow() === 0) {
      ws.appendRow(V2.headers[name]);
      ws.setFrozenRows(1);
      ws.getRange(1,1,1,V2.headers[name].length).setFontWeight('bold').setBackground('#E3F2E9');
    } else {
      const actual = ws.getRange(1,1,1,V2.headers[name].length).getValues()[0];
      if (actual.join('|') !== V2.headers[name].join('|')) throw new Error('Schema mismatch: '+name);
    }
  });
  const sw = ss.getSheetByName(V2.settings);
  const existing = new Set(rows_(sw).map(r=>String(r.key)));
  Object.entries(V2.defaults).forEach(([key,value]) => {
    if (!existing.has(key)) sw.appendRow([key,value,new Date().toISOString()]);
  });
  return 'V2 ready: '+ss.getUrl();
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData && e.postData.contents || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('BACKEND_SECRET');
    if (!secret || !body.secret || body.secret !== secret) throw new Error('DENIED');
    const data = route_(String(body.action || ''),body.payload || {},String(body.actorId || ''));
    return out_({ok:true,data:data});
  } catch(err) {
    console.error('API error:',err && err.message);
    return out_({ok:false,error:publicError_(err)});
  }
}
function out_(data) { return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON); }
function publicError_(err) {
  const m=String(err && err.message || 'ERROR');
  const safe=['DENIED','NOT_INITIALIZED','FORBIDDEN','NOT_FOUND','CLOSED','INVALID_INPUT','DUPLICATE','LOCKED','OWNER_EXISTS','BAD_ROLE','LAST_OWNER','USERNAME_EXISTS'];
  return safe.includes(m) ? m : 'SERVER_ERROR';
}
function db_() {
  const id=PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('NOT_INITIALIZED');
  const ss = SpreadsheetApp.openById(id);
  if (!/STAGING|TEST|ทดสอบ/i.test(ss.getName())) throw new Error('STAGING_ONLY');
  return ss;
}
function tab_(name) {const ws=db_().getSheetByName(name);if(!ws)throw new Error('NOT_INITIALIZED');return ws;}
function rows_(ws) {
  const last=ws.getLastRow();if(last<2)return [];
  const a=ws.getDataRange().getValues(), headers=a.shift();
  return a.map((v,i)=>Object.fromEntries(headers.map((key,j)=>[key, v[j]]).concat([['_row',i+2]])));
}
function clean_(v,max) {
  const t=String(v==null?'':v).trim().replace(/[\u0000-\u001F]/g,' ');
  if(t.length>max)throw new Error('INVALID_INPUT');
  return t;
}
function cell_(v) {const t=String(v==null?'':v); return /^[=+\-@]/.test(t) ? "'"+t : t;}
function getSettings_() {
  const s=Object.assign({},V2.defaults);
  rows_(tab_(V2.settings)).forEach(r=>s[String(r.key)]=String(r.value));
  s.admissionsOpen=s.admissionsOpen==='true';
  s.majors=s.majors.split('\n').map(m=>m.trim()).filter(Boolean);
  return s;
}
function publicSettings_() { const s=getSettings_();return {schoolName:s.schoolName,admissionYear:s.admissionYear,admissionTitle:s.admissionTitle,welcomeMessage:s.welcomeMessage,admissionsOpen:s.admissionsOpen,majors:s.majors,privacyNotice:s.privacyNotice}; }
function getStaff_() {return rows_(tab_(V2.staff));}
function user_(id) {return getStaff_().find(u=>String(u.id)===String(id)) || null;}
function active_(u) {return !!u&&(u.active===true||String(u.active).toLowerCase()==='true');}
function safeUser_(u) { return {id:String(u.id),username:String(u.username),displayName:String(u.displayName),role:String(u.role),active:active_(u),authVersion:Number(u.authVersion)||1}; }
function requireRole_(id,allowed) {const u=user_(id);if(!active_(u)||!allowed.includes(String(u.role)))throw new Error('FORBIDDEN');return u;}
function audit_(actor,action,target,detail) {tab_(V2.audit).appendRow([new Date().toISOString(),actor,action,target,clean_(detail,250)]);}
function updateRow_(ws,row,patch) {
  const headers=V2.headers[ws.getName()];
  Object.entries(patch).forEach(([key,value])=>{
    const ix=headers.indexOf(key);if(ix<0)throw new Error('INVALID_INPUT');
    ws.getRange(row,ix+1).setValue(value);
  });
}
function lock_(fn) {const l=LockService.getScriptLock();l.waitLock(20000);try{return fn();}finally{l.releaseLock();}}

function route_(action,p,actorId) {
  if(action==='setup.status') return {ownerExists:getStaff_().some(u=>u.role==='Owner'&&active_(u))};
  if(action==='setup.bootstrap')return lock_(()=>bootstrap_(p));
  if(action==='form.config')return publicSettings_();
  if(action==='form.submit')return lock_(()=>submit_(p));
  if(action==='auth.lookup') {
    const name=clean_(p.username,60).toLowerCase();
    const u=getStaff_().find(x=>String(x.username).toLowerCase()===name);
    if(!active_(u)) return null;
    if(u.lockedUntil && Date.now()<new Date(u.lockedUntil).getTime())return {locked:true};
    return {id:String(u.id),salt:String(u.passwordSalt),hash:String(u.passwordHash),iterations:Number(u.iterations)||100000};
  }
  if(action==='auth.failed'||action==='auth.success')return lock_(()=>authEvent_(action,p));
  if(action==='auth.getUser') {
    const u=user_(actorId);if(!active_(u))throw new Error('FORBIDDEN');return safeUser_(u);
  }
  if(action==='admin.application.detail'){requireRole_(actorId,['Owner','Admin','Staff','Viewer']);return detail_(p);}
  if(action==='admin.application.history'){requireRole_(actorId,['Owner','Admin','Staff','Viewer']);return history_(p);}
  if(action==='admin.dashboard') {requireRole_(actorId,['Owner','Admin','Staff','Viewer']);return dashboard_();}
  if(action==='admin.applications') {requireRole_(actorId,['Owner','Admin','Staff','Viewer']);return listApps_();}
  if(action==='admin.application.status') {
    requireRole_(actorId,['Owner','Admin','Staff']);return lock_(()=>status_(p,actorId));
  }
  if(action==='admin.staff.list') {requireRole_(actorId,['Owner']);return getStaff_().map(safeUser_);}
  if(action==='admin.staff.create') {requireRole_(actorId,['Owner']);return lock_(()=>createStaff_(p,actorId));}
  if(action==='admin.staff.update') {requireRole_(actorId,['Owner']);return lock_(()=>updateStaff_(p,actorId));}
  if(action==='admin.settings.get') {requireRole_(actorId,['Owner','Admin']);return getSettings_();}
  if(action==='admin.settings.update') {requireRole_(actorId,['Owner','Admin']);return lock_(()=>updateSettings_(p,actorId));}
  throw new Error('NOT_FOUND');
}
function bootstrap_(p) {
  if(getStaff_().some(u=>active_(u)&&u.role==='Owner'))throw new Error('OWNER_EXISTS');
  return createStaff_(Object.assign({},p,{role:'Owner'}),'SYSTEM',true);
}
function validPassword_(p) {
  if(!p || !/^[a-zA-Z0-9_-]{16,128}$/.test(String(p.salt)) || !/^[a-f0-9]{64}$/.test(String(p.hash)) || Number(p.iterations)!==100000)throw new Error('INVALID_INPUT');
}
function createStaff_(p,actor,bootstrap) {
  const username=clean_(p.username,60).toLowerCase();
  const displayName=clean_(p.displayName,100);
  const role=bootstrap?'Owner':clean_(p.role,20);
  if(!/^[a-z0-9_.-]{3,60}$/.test(username)||!displayName||!['Owner','Admin','Staff','Viewer'].includes(role))throw new Error('INVALID_INPUT');
  if(!bootstrap&&role==='Owner')throw new Error('BAD_ROLE');
  if(getStaff_().some(u=>String(u.username).toLowerCase()===username))throw new Error('USERNAME_EXISTS');
  validPassword_(p.password);
  const id=Utilities.getUuid(),now=new Date().toISOString();
  tab_(V2.staff).appendRow([id,cell_(username),cell_(displayName),role,true,p.password.salt,p.password.hash,100000,0,'',1,now,now]);
  audit_(actor,'staff.create',id,username+' / '+role);
  return {id,username,displayName,role,active:true,authVersion:1};
}
function updateStaff_(p,actor) {
  const target=user_(clean_(p.id,80));if(!target)throw new Error('NOT_FOUND');
  if(target.role==='Owner')throw new Error('LAST_OWNER');
  const patch={updatedAt:new Date().toISOString()};
  if(p.displayName!==undefined) {patch.displayName=cell_(clean_(p.displayName,100));if(!patch.displayName)throw new Error('INVALID_INPUT');}
  if(p.role!==undefined) {if(!['Admin','Staff','Viewer'].includes(p.role))throw new Error('BAD_ROLE');patch.role=p.role;}
  if(p.active!==undefined)patch.active=p.active===true;
  if(p.password) {validPassword_(p.password);patch.passwordSalt=p.password.salt;patch.passwordHash=p.password.hash;patch.iterations=100000;patch.failedAttempts=0;patch.lockedUntil='';patch.authVersion=(Number(target.authVersion)||1)+1;}
  updateRow_(tab_(V2.staff),target._row,patch);
  audit_(actor,'staff.update',target.id,JSON.stringify(Object.keys(p).filter(k=>k!=='password')));
  return {updated:true};
}
function authEvent_(action,p) {
  const u=user_(clean_(p.id,80));if(!u||!active_(u))return {ok:false};
  const ws=tab_(V2.staff);
  if(action==='auth.success')updateRow_(ws,u._row,{failedAttempts:0,lockedUntil:''});
  else {
    const attempts=(Number(u.failedAttempts)||0)+1;
    updateRow_(ws,u._row,{failedAttempts:attempts,lockedUntil:attempts>=5?new Date(Date.now()+15*60000).toISOString():''});
  }
  return {ok:true};
}
function submit_(p) {
  const s=getSettings_();if(!s.admissionsOpen)throw new Error('CLOSED');
  if(clean_(p.website,100)||p.consent!==true)throw new Error('INVALID_INPUT');
  const rules={prefix:15,firstName:80,lastName:80,phone:20,previousSchool:200,gpa:8,level:25,major:150,note:400,address:200,district:100,amphoe:100,province:100,zipcode:5,guardianName:160,relationship:60,guardianPhone:20};
  const x={};Object.entries(rules).forEach(([k,max])=>x[k]=clean_(p[k],max));
  const required=['prefix','firstName','lastName','phone','previousSchool','level','major','address','district','amphoe','province','zipcode','guardianName','relationship','guardianPhone'];
  if(required.some(k=>!x[k])||!['นาย','นางสาว','นาง'].includes(x.prefix)||!['ปวช.','ปวส.'].includes(x.level))throw new Error('INVALID_INPUT');
  if(!/^0[0-9]{9}$/.test(x.phone)||!/^0[0-9]{9}$/.test(x.guardianPhone)||!/^[0-9]{5}$/.test(x.zipcode))throw new Error('INVALID_INPUT');
  if(x.gpa&&!/^(?:[0-3](?:\\.[0-9]{1,2})?|4(?:\\.0{1,2})?)$/.test(x.gpa))throw new Error('INVALID_INPUT');
  if(!s.majors.includes(x.major))throw new Error('INVALID_INPUT');
  const key=clean_(p.idempotencyKey,100);
  if(!/^[a-zA-Z0-9_-]{20,100}$/.test(key))throw new Error('INVALID_INPUT');
  const ws=tab_(V2.applications), last=ws.getLastRow();
  const ids=last>1?ws.getRange(2,24,last-1,1).getDisplayValues().flat():[];
  const previousIndex=ids.indexOf(key);
  if(previousIndex>=0){const oldId=String(ws.getRange(previousIndex+2,1).getValue());return {reference:oldId.slice(0,8).toUpperCase(),duplicate:true};}
  const id=Utilities.getUuid(),now=new Date().toISOString();
  const row=[id,now,x.prefix,x.firstName,x.lastName,x.phone,x.previousSchool,x.gpa,x.level,x.major,x.note,'รอตรวจสอบ',now,x.address,x.district,x.amphoe,x.province,x.zipcode,x.guardianName,x.relationship,x.guardianPhone,1,clean_(p.consentVersion,60)||'v2.1-draft',key].map(cell_);
  ws.appendRow(row); tab_('QRV21_ApplicationHistory').appendRow([now,id,'PUBLIC','','รอตรวจสอบ','submitted']);
  audit_('PUBLIC','application.submit',id,'Submitted in staging');
  return {reference:id.slice(0,8).toUpperCase(),submittedAt:now,duplicate:false};
}
function listApps_() {
  const ws=tab_(V2.applications),last=ws.getLastRow();if(last<2)return [];
  const count=Math.min(300,last-1),start=last-count+1;
  const headers=V2.headers[V2.applications];
  const data=ws.getRange(start,1,count,headers.length).getValues();
  return data.reverse().map(r=>Object.fromEntries(headers.map((h,i)=>[h, r[i] instanceof Date?r[i].toISOString():r[i]])));
}
function dashboard_() {
  const ws=tab_(V2.applications),last=ws.getLastRow();
  const counts={'รอตรวจสอบ':0,'กำลังตรวจสอบ':0,'ผ่านการคัดเลือก':0,'ไม่ผ่านการคัดเลือก':0};
  if(last>1)ws.getRange(2,12,last-1,1).getValues().forEach(r=>{const k=String(r[0]);counts[k]=(counts[k]||0)+1;});
  return {total:Math.max(0,last-1),counts,recent:listApps_().slice(0,6)};
}
function status_(p,actor) {
  const id=clean_(p.id,80),status=clean_(p.status,40);
  if(!['รอตรวจสอบ','กำลังตรวจสอบ','ผ่านการคัดเลือก','ไม่ผ่านการคัดเลือก'].includes(status))throw new Error('INVALID_INPUT');
  const ws=tab_(V2.applications),last=ws.getLastRow();if(last<2)throw new Error('NOT_FOUND');
  const ids=ws.getRange(2,1,last-1,1).getValues().map(r=>String(r[0]));const ix=ids.indexOf(id);
  if(ix<0)throw new Error('NOT_FOUND');
  const oldStatus=String(ws.getRange(ix+2,12).getValue());
  if(oldStatus===status)return {updated:false};
  ws.getRange(ix+2,12,1,2).setValues([[status,new Date().toISOString()]]);
  const oldRevision=Number(ws.getRange(ix+2,22).getValue())||1;ws.getRange(ix+2,22).setValue(oldRevision+1);
  tab_('QRV21_ApplicationHistory').appendRow([new Date().toISOString(),id,actor,oldStatus,status,clean_(p.note,250)]);
  audit_(actor,'application.status',id,status);return {updated:true};
}
function updateSettings_(p,actor) {
  const allowed=['schoolName','admissionYear','admissionTitle','welcomeMessage','admissionsOpen','majors','privacyNotice'];
  const max={schoolName:120,admissionYear:10,admissionTitle:160,welcomeMessage:320,privacyNotice:700};
  const proposed={};
  allowed.forEach(key=>{
    if(p[key]===undefined)return;
    if(key==='admissionsOpen')proposed[key]=p[key]===true?'true':'false';
    else if(key==='majors') {
      if(!Array.isArray(p.majors)||p.majors.length>70)throw new Error('INVALID_INPUT');
      const majors=p.majors.map(v=>clean_(v,120)).filter(Boolean);if(!majors.length)throw new Error('INVALID_INPUT');
      proposed[key]=majors.join('\n');
    } else proposed[key]=clean_(p[key],max[key]);
  });
  const ws=tab_(V2.settings);const current=rows_(ws);const now=new Date().toISOString();
  Object.entries(proposed).forEach(([key,value])=>{
    const existing=current.find(r=>r.key===key);
    if(existing)updateRow_(ws,existing._row,{value:cell_(value),updatedAt:now});
    else ws.appendRow([key,cell_(value),now]);
  });
  audit_(actor,'settings.update','SETTINGS',Object.keys(proposed).join(','));
  return getSettings_();
}
function detail_(p){
 const id=clean_(p.id,80),ws=tab_(V2.applications);const data=rows_(ws);
 const item=data.find(r=>String(r.id)===id);if(!item)throw new Error('NOT_FOUND');
 delete item._row;return item;
}
function history_(p){
 const id=clean_(p.id,80),ws=tab_('QRV21_ApplicationHistory');
 return rows_(ws).filter(r=>String(r.applicationId)===id).slice(-100).map(r=>({at:String(r.at),actorId:String(r.actorId),oldStatus:String(r.oldStatus),newStatus:String(r.newStatus),note:String(r.note)}));
}
