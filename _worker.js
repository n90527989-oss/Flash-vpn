/* ===== VPN shop: one-file Cloudflare Pages worker (no folders needed) =====
   Bindings: D1 database variable name = DB
   Secrets : ADMIN_PASSWORD, SESSION_SECRET                                       */
const enc=new TextEncoder();
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const unhex=h=>new Uint8Array((h.match(/../g)||[]).map(x=>parseInt(x,16)));
const key=(s,u,hash='SHA-256')=>crypto.subtle.importKey('raw',typeof s==='string'?enc.encode(s):s,{name:'HMAC',hash},false,u);
const json=(o,s=200,h={})=>new Response(JSON.stringify(o),{status:s,headers:{'content-type':'application/json','cache-control':'no-store',...h}});
const mac=async(secret,m)=>crypto.subtle.sign('HMAC',await key(secret,['sign']),enc.encode(m));
function eq(a,b){a=String(a);b=String(b);if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
const clip=(s,n)=>String(s==null?'':s).trim().slice(0,n);

/* ---------- passwords ---------- */
async function hashPw(pw,saltHex){
  const salt=saltHex?unhex(saltHex):crypto.getRandomValues(new Uint8Array(16));
  const k=await crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},k,256);
  return hex(salt)+':'+hex(bits);
}
const checkPw=async(pw,stored)=>eq(await hashPw(pw,stored.split(':')[0]),stored);

/* ---------- sessions ---------- */
async function setUserCookie(env,id){
  const exp=Date.now()+30*864e5,sig=hex(await mac(env.SESSION_SECRET,'u'+id+'.'+exp));
  return `usr=${id}.${exp}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;
}
const userClear='usr=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
async function userId(req,env){
  const m=(req.headers.get('cookie')||'').match(/(?:^|; )usr=(\d+)\.(\d+)\.([0-9a-f]{64})/);
  if(!m||+m[2]<Date.now()||!env.SESSION_SECRET)return 0;
  return eq(hex(await mac(env.SESSION_SECRET,'u'+m[1]+'.'+m[2])),m[3])?+m[1]:0;
}
async function kvGet(env,k){const r=await env.DB.prepare('SELECT v FROM kv WHERE k=?').bind(k).first();return r?r.v:null}
const kvSet=(env,k,v)=>env.DB.prepare('INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)').bind(k,String(v)).run();
const kvDel=(env,k)=>env.DB.prepare('DELETE FROM kv WHERE k=?').bind(k).run();
const adminVer=async env=>+(await kvGet(env,'sv'))||0;
async function adminCookie(env){
  const exp=Date.now()+12*3600e3,ver=await adminVer(env),sig=hex(await mac(env.SESSION_SECRET,'a'+exp+'.'+ver));
  return `adm=${exp}.${ver}.${sig}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;
}
const adminClear='adm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
async function adminOk(req,env){
  const m=(req.headers.get('cookie')||'').match(/(?:^|; )adm=(\d+)\.(\d+)\.([0-9a-f]{64})/);
  if(!m||+m[1]<Date.now()||!env.SESSION_SECRET||!env.DB)return false;
  if(!eq(hex(await mac(env.SESSION_SECRET,'a'+m[1]+'.'+m[2])),m[3]))return false;
  try{return +m[2]===await adminVer(env)}catch(e){return false}
}

/* ---------- ip, log, rate limit ---------- */
const ip=req=>(req.headers.get('cf-connecting-ip')||'unknown').slice(0,64);
async function slog(env,req,type,info){
  try{
    await env.DB.prepare('INSERT INTO sec_log (t,type,ip,ua,info) VALUES (?,?,?,?,?)').bind(Date.now(),type,ip(req),(req.headers.get('user-agent')||'').slice(0,160),String(info||'').slice(0,200)).run();
    if(Math.random()<.02)await env.DB.prepare('DELETE FROM sec_log WHERE id<(SELECT MAX(id)-1500 FROM sec_log)').run();
  }catch(e){}
}
async function rlGet(env,k,win){const r=await env.DB.prepare('SELECT n,t FROM rl WHERE k=?').bind(k).first();return r&&Date.now()-r.t<win*1000?r.n:0}
async function rlInc(env,k,win){
  const now=Date.now(),r=await env.DB.prepare('SELECT n,t FROM rl WHERE k=?').bind(k).first();
  if(Math.random()<.02)await env.DB.prepare('DELETE FROM rl WHERE t<?').bind(now-864e5).run();
  if(!r||now-r.t>=win*1000){await env.DB.prepare('INSERT OR REPLACE INTO rl (k,n,t) VALUES (?,1,?)').bind(k,now).run();return 1}
  await env.DB.prepare('UPDATE rl SET n=n+1 WHERE k=?').bind(k).run();return r.n+1;
}
const rlClear=(env,k)=>env.DB.prepare('DELETE FROM rl WHERE k=?').bind(k).run();
const limited=async(env,req,name,max,win)=>(await rlInc(env,name+':'+ip(req),win))>max;

/* ---------- TOTP (Google Authenticator) ---------- */
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function newSecret(){let bits='';for(const x of crypto.getRandomValues(new Uint8Array(20)))bits+=x.toString(2).padStart(8,'0');let s='';for(let i=0;i<160;i+=5)s+=B32[parseInt(bits.slice(i,i+5),2)];return s}
function b32dec(s){let bits='';for(const c of s.toUpperCase().replace(/[^A-Z2-7]/g,''))bits+=B32.indexOf(c).toString(2).padStart(5,'0');const o=[];for(let i=0;i+8<=bits.length;i+=8)o.push(parseInt(bits.slice(i,i+8),2));return new Uint8Array(o)}
async function hotp(secret,counter){
  const buf=new ArrayBuffer(8);new DataView(buf).setUint32(4,counter);
  const h=new Uint8Array(await crypto.subtle.sign('HMAC',await key(b32dec(secret),['sign'],'SHA-1'),buf)),o=h[19]&15;
  return String((((h[o]&127)<<24)|(h[o+1]<<16)|(h[o+2]<<8)|h[o+3])%1e6).padStart(6,'0');
}
async function totpCheck(env,secret,code){
  code=String(code||'').replace(/\s/g,'');if(!/^\d{6}$/.test(code))return 0;
  const c=Math.floor(Date.now()/30000),last=+(await kvGet(env,'totp_last'))||0;
  for(const d of[0,-1,1])if(c+d>last&&eq(await hotp(secret,c+d),code)){await kvSet(env,'totp_last',c+d);return c+d}
  return 0;
}

/* ============ database schema (auto-created once per isolate) ============ */
const TABLES=[
 'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
 'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, pw TEXT NOT NULL, created INTEGER NOT NULL, banned INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS plans (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL, days INTEGER NOT NULL, gb INTEGER NOT NULL DEFAULT 0, feats TEXT, best INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0)',
 'CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL, pm TEXT NOT NULL, ref TEXT, st TEXT NOT NULL DEFAULT \'pending\', note TEXT, created INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS subs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, order_id TEXT NOT NULL, plan TEXT NOT NULL, link TEXT NOT NULL, exp INTEGER NOT NULL, created INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS tickets (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, subject TEXT NOT NULL, status TEXT NOT NULL DEFAULT \'open\', created INTEGER NOT NULL, updated INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS ticket_msgs (id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL)',
 'CREATE TABLE IF NOT EXISTS sec_log (id INTEGER PRIMARY KEY AUTOINCREMENT, t INTEGER NOT NULL, type TEXT NOT NULL, ip TEXT, ua TEXT, info TEXT)',
 'CREATE TABLE IF NOT EXISTS rl (k TEXT PRIMARY KEY, n INTEGER NOT NULL, t INTEGER NOT NULL)'
];
const INDEXES=[
 'CREATE INDEX IF NOT EXISTS i_ord_user ON orders(user_id)','CREATE INDEX IF NOT EXISTS i_sub_user ON subs(user_id)',
 'CREATE INDEX IF NOT EXISTS i_tk_user ON tickets(user_id)','CREATE INDEX IF NOT EXISTS i_msg_tk ON ticket_msgs(ticket_id)','CREATE INDEX IF NOT EXISTS i_log_t ON sec_log(t)'
];
const SEED=[
 ['یک‌ماهه',150000,30,50,'۱ کاربر هم‌زمان\n۵۰ گیگ ترافیک\nپشتیبانی تلگرام',0,1],
 ['سه‌ماهه',360000,90,0,'۲ کاربر هم‌زمان\nترافیک نامحدود منصفانه\nپشتیبانی اولویت‌دار',1,2],
 ['سالانه',1200000,365,0,'۳ کاربر هم‌زمان\nترافیک نامحدود منصفانه\nتعویض رایگان سرور',0,3]
];
let ready=null;
function schema(env){
  return ready||(ready=(async()=>{
    await env.DB.batch(TABLES.map(q=>env.DB.prepare(q)));
    await env.DB.batch(INDEXES.map(q=>env.DB.prepare(q)));
    const c=await env.DB.prepare('SELECT COUNT(*) c FROM plans').first();
    if(!c.c)await env.DB.batch(SEED.map(s=>env.DB.prepare('INSERT INTO plans (name,price,days,gb,feats,best,sort) VALUES (?,?,?,?,?,?,?)').bind(...s)));
  })().catch(e=>{ready=null;throw e}));
}

/* ============ live flags (maintenance, banned IPs), cached 15 s ============ */
let FL={t:0,maint:false,ban:new Set()};
async function flags(env){
  if(Date.now()-FL.t<15000)return FL;
  try{
    const r=await env.DB.prepare("SELECT k,v FROM kv WHERE k IN ('maint','ban')").all(),o={t:Date.now(),maint:false,ban:new Set()};
    for(const x of r.results){if(x.k==='maint')o.maint=x.v==='1';if(x.k==='ban'){try{JSON.parse(x.v).forEach(i=>o.ban.add(i))}catch(e){}}}
    FL=o;
  }catch(e){FL.t=Date.now()}
  return FL;
}

/* ============ security headers ============ */
const CSP=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'","script-src 'self' 'unsafe-inline'","style-src 'self' 'unsafe-inline' https://fonts.googleapis.com","font-src 'self' https://fonts.gstatic.com data:","img-src 'self' data:","connect-src 'self'",'upgrade-insecure-requests'].join('; ');
function sec(r,admin){
  const h=new Headers(r.headers),ct=h.get('content-type')||'';
  h.set('X-Content-Type-Options','nosniff');h.set('X-Frame-Options','DENY');h.set('Referrer-Policy','strict-origin-when-cross-origin');
  h.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  h.set('Strict-Transport-Security','max-age=31536000');h.set('Cross-Origin-Opener-Policy','same-origin');h.set('Cross-Origin-Resource-Policy','same-origin');
  if(ct.includes('text/html'))h.set('Content-Security-Policy',CSP);
  if(admin){h.set('Cache-Control','no-store');h.set('X-Robots-Tag','noindex, nofollow')}
  else if(/text\/html|javascript|text\/css/.test(ct))h.set('Cache-Control','no-cache');
  return new Response(r.status===101||r.status===204||r.status===304?null:r.body,{status:r.status,statusText:r.statusText,headers:h});
}
const text=(t,s)=>sec(new Response(t,{status:s,headers:{'content-type':'text/plain;charset=utf-8','cache-control':'no-store'}}));
const BAD=/(^|\/)\.(?!well-known)|\.(sql|md|bak|old|log|env|php\d?|asp|aspx|jsp|cgi|ini|ya?ml|toml|map|sh|git)(\/|$)|^\/(functions|db|node_modules|wp-[a-z]+|phpmyadmin|pma|xmlrpc|cgi-bin|vendor)(\/|$)/i;
const MAINT='<!DOCTYPE html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="120"><title>در حال به‌روزرسانی</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#060504;color:#f5ecd6;font:16px/1.9 Vazirmatn,Tahoma,sans-serif;text-align:center}h1{margin:0 0 8px;color:#e2b64c}p{margin:0;color:#a99a78}</style></head><body><main role="status"><h1>در حال به‌روزرسانی</h1><p>کمی بعد دوباره سر بزن؛ این صفحه خودش هم تازه می‌شود.</p></main></body></html>';

/* ============ user API ============ */
const orderId=()=>'ORD-'+Date.now().toString(36).slice(-5).toUpperCase()+Math.floor(Math.random()*36).toString(36).toUpperCase();
const INT=(x,a,b)=>{x=Math.floor(+x);return Number.isFinite(x)&&x>=a&&x<=b?x:null};
async function publicConfig(env){
  const plans=(await env.DB.prepare('SELECT id,name,price,days,gb,feats,best FROM plans WHERE active=1 ORDER BY sort,id').all()).results;
  const r=await env.DB.prepare("SELECT k,v FROM kv WHERE k IN ('card','card_name','usdt','support','banner')").all(),o={};
  for(const x of r.results)o[x.k]=x.v;
  let banner=null;try{banner=o.banner?JSON.parse(o.banner):null}catch(e){}
  return {plans,pay:{card:o.card||'',card_name:o.card_name||'',usdt:o.usdt||''},support:o.support||'',banner:banner&&banner.on&&banner.text?banner:null};
}
async function me(req,env){
  const id=await userId(req,env);if(!id)return null;
  const u=await env.DB.prepare('SELECT id,username,email,created,banned FROM users WHERE id=?').bind(id).first();
  return u&&!u.banned?u:null;
}
async function userApi(req,env,p,m,b){
  if(p==='/api/health')return json({ok:true});
  if(p==='/api/config'&&m==='GET')return json(await publicConfig(env));
  if(p==='/api/auth/register'&&m==='POST'){
    if(await limited(env,req,'reg',5,3600))return json({error:'تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کن.'},429);
    const u=clip(b.username,24),e=clip(b.email,80).toLowerCase(),pw=String(b.password||'');
    if(!/^[A-Za-z0-9_\u0600-\u06FF]{3,24}$/.test(u))return json({error:'نام کاربری ۳ تا ۲۴ حرف، عدد یا _ باشد.'},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e))return json({error:'ایمیل معتبر نیست.'},400);
    if(pw.length<8||pw.length>72||!/[A-Za-z]/.test(pw)||!/\d/.test(pw))return json({error:'رمز عبور ۸ تا ۷۲ کاراکتر و شامل حرف و عدد باشد.'},400);
    if(await env.DB.prepare('SELECT id FROM users WHERE username=? OR email=?').bind(u,e).first())return json({error:'این نام کاربری یا ایمیل قبلاً ثبت شده است.'},409);
    const r=await env.DB.prepare('INSERT INTO users (username,email,pw,created) VALUES (?,?,?,?)').bind(u,e,await hashPw(pw),Date.now()).run();
    await slog(env,req,'register',u);
    return json({ok:true},200,{'set-cookie':await setUserCookie(env,r.meta.last_row_id)});
  }
  if(p==='/api/auth/login'&&m==='POST'){
    if(await limited(env,req,'login',10,900))return json({error:'تلاش‌ها زیاد بود؛ ۱۵ دقیقه بعد دوباره امتحان کن.'},429);
    const id=clip(b.id,80),pw=String(b.password||'').slice(0,100);
    const u=await env.DB.prepare('SELECT id,pw,banned FROM users WHERE username=? OR email=?').bind(id,id.toLowerCase()).first();
    const ok=u?await checkPw(pw,u.pw):(await hashPw(pw),false);
    if(!ok){await slog(env,req,'login_fail',id);return json({error:'نام کاربری یا رمز اشتباه است.'},401)}
    if(u.banned)return json({error:'حساب شما مسدود شده است.'},403);
    return json({ok:true},200,{'set-cookie':await setUserCookie(env,u.id)});
  }
  if(p==='/api/auth/logout')return json({ok:true},200,{'set-cookie':userClear});
  const u=await me(req,env);
  if(!u)return json({error:'auth'},401);
  if(p==='/api/me'&&m==='GET'){
    const orders=(await env.DB.prepare('SELECT id,items,total,pm,ref,st,note,created FROM orders WHERE user_id=? ORDER BY created DESC LIMIT 50').bind(u.id).all()).results.map(o=>{try{o.items=JSON.parse(o.items)}catch(e){o.items=[]}return o});
    const subs=(await env.DB.prepare('SELECT id,plan,link,exp FROM subs WHERE user_id=? ORDER BY exp DESC').bind(u.id).all()).results;
    const tickets=(await env.DB.prepare('SELECT id,subject,status,updated FROM tickets WHERE user_id=? ORDER BY updated DESC LIMIT 20').bind(u.id).all()).results;
    if(tickets.length){
      const ms=(await env.DB.prepare(`SELECT ticket_id,author,body,created FROM ticket_msgs WHERE ticket_id IN (${tickets.map(()=>'?').join(',')}) ORDER BY id`).bind(...tickets.map(t=>t.id)).all()).results;
      tickets.forEach(t=>t.msgs=ms.filter(x=>x.ticket_id===t.id));
    }
    return json({user:{username:u.username,email:u.email,created:u.created},orders,subs,tickets});
  }
  if(p==='/api/me/password'&&m==='POST'){
    const nw=String(b.new||'');
    if(nw.length<8||nw.length>72||!/[A-Za-z]/.test(nw)||!/\d/.test(nw))return json({error:'رمز جدید ۸ تا ۷۲ کاراکتر و شامل حرف و عدد باشد.'},400);
    const row=await env.DB.prepare('SELECT pw FROM users WHERE id=?').bind(u.id).first();
    if(!(await checkPw(String(b.old||''),row.pw)))return json({error:'رمز فعلی اشتباه است.'},400);
    await env.DB.prepare('UPDATE users SET pw=? WHERE id=?').bind(await hashPw(nw),u.id).run();
    return json({ok:true});
  }
  if(p==='/api/orders'&&m==='POST'){
    if(await limited(env,req,'ord',10,3600))return json({error:'تعداد سفارش‌ها زیاد بود؛ کمی بعد دوباره امتحان کن.'},429);
    const plans=(await env.DB.prepare('SELECT id,name,price,days FROM plans WHERE active=1').all()).results,map={};
    plans.forEach(x=>map[x.id]=x);
    const raw=Array.isArray(b.items)?b.items.slice(0,5):[],items=[];
    for(const i of raw){
      const pid=INT(i&&i.id,1,1e9),q=INT(i&&i.q,1,10),pl=map[pid];
      if(!pl||!q)return json({error:'پلن انتخاب‌شده معتبر نیست.'},400);
      const ex=items.find(x=>x.id===pid);
      if(ex)ex.q=Math.min(10,ex.q+q);else items.push({id:pid,name:pl.name,price:pl.price,days:pl.days,q});
    }
    if(!items.length)return json({error:'سبد خرید خالی است.'},400);
    const total=items.reduce((a,i)=>a+i.price*i.q,0),pm=b.pm==='usdt'?'usdt':'card',id=orderId();
    await env.DB.prepare('INSERT INTO orders (id,user_id,items,total,pm,created) VALUES (?,?,?,?,?,?)').bind(id,u.id,JSON.stringify(items),total,pm,Date.now()).run();
    await slog(env,req,'order',id);
    return json({ok:true,id,total});
  }
  if(p==='/api/orders/ref'&&m==='POST'){
    const ref=clip(b.ref,80);if(ref.length<3)return json({error:'شماره پیگیری یا ۴ رقم آخر کارت را وارد کن.'},400);
    const r=await env.DB.prepare("UPDATE orders SET ref=?,st='review' WHERE id=? AND user_id=? AND st IN ('pending','review')").bind(ref,clip(b.id,20),u.id).run();
    return r.meta.changes?json({ok:true}):json({error:'سفارش پیدا نشد.'},404);
  }
  if(p==='/api/tickets'&&m==='POST'){
    if(await limited(env,req,'tk',5,3600))return json({error:'تعداد تیکت‌ها زیاد بود؛ کمی بعد دوباره امتحان کن.'},429);
    const s=clip(b.subject,80),body=clip(b.message,2000);
    if(s.length<3||body.length<5)return json({error:'موضوع و متن پیام را کامل‌تر بنویس.'},400);
    const id='TK-'+Date.now().toString(36).slice(-5).toUpperCase(),now=Date.now();
    await env.DB.batch([env.DB.prepare('INSERT INTO tickets (id,user_id,subject,created,updated) VALUES (?,?,?,?,?)').bind(id,u.id,s,now,now),env.DB.prepare("INSERT INTO ticket_msgs (ticket_id,author,body,created) VALUES (?,'user',?,?)").bind(id,body,now)]);
    return json({ok:true,id});
  }
  if(p==='/api/tickets/reply'&&m==='POST'){
    const body=clip(b.body,2000),id=clip(b.id,20);if(body.length<2)return json({error:'پیام خالی است.'},400);
    const t=await env.DB.prepare('SELECT id FROM tickets WHERE id=? AND user_id=?').bind(id,u.id).first();if(!t)return json({error:'تیکت پیدا نشد.'},404);
    if(await limited(env,req,'tkr',20,3600))return json({error:'تعداد پیام‌ها زیاد بود.'},429);
    const now=Date.now();
    await env.DB.batch([env.DB.prepare("INSERT INTO ticket_msgs (ticket_id,author,body,created) VALUES (?,'user',?,?)").bind(id,body,now),env.DB.prepare("UPDATE tickets SET status='open',updated=? WHERE id=?").bind(now,id)]);
    return json({ok:true});
  }
  return json({error:'not found'},404);
}

/* ============ admin API ============ */
const samePw=async(a,env)=>eq(hex(await mac(env.SESSION_SECRET,'pw:'+a)),hex(await mac(env.SESSION_SECRET,'pw:'+env.ADMIN_PASSWORD)));
const IPRX=/^[0-9a-fA-F:.]{3,45}$/;
async function adminApi(req,env,p,m,b){
  if(!env.ADMIN_PASSWORD||!env.SESSION_SECRET)return json({error:'setup'},500);
  const a=p.slice(11),D=env.DB;
  if(a==='login'&&m==='POST'){
    const lk='adm:'+ip(req);
    if(await rlGet(env,lk,900)>=5){await slog(env,req,'admin_locked','');return json({error:'locked'},429)}
    await new Promise(r=>setTimeout(r,600));
    const fail=async(t,i)=>{const n=await rlInc(env,lk,900);await slog(env,req,t,i);return json({error:n>=5?'locked':'bad'},n>=5?429:401)};
    if(!(await samePw(String(b.password||''),env)))return fail('admin_login_fail','رمز اشتباه');
    const ts=await kvGet(env,'totp');
    if(ts&&env.ADMIN_2FA_OFF!=='1'){
      if(!b.code)return json({need2fa:true});
      if(!(await totpCheck(env,ts,b.code)))return fail('admin_2fa_fail','کد دومرحله‌ای اشتباه');
    }
    await rlClear(env,lk);await slog(env,req,'admin_login_ok','');
    return json({ok:true},200,{'set-cookie':await adminCookie(env)});
  }
  if(a==='logout')return json({ok:true},200,{'set-cookie':adminClear});
  if(!(await adminOk(req,env)))return json({error:'auth'},401);
  if(a==='me')return json({ok:true});
  if(a==='stats'){
    const c=async(q,...x)=>(await D.prepare(q).bind(...x).first()).c;
    return json({users:await c('SELECT COUNT(*) c FROM users'),review:await c("SELECT COUNT(*) c FROM orders WHERE st='review'"),pending:await c("SELECT COUNT(*) c FROM orders WHERE st='pending'"),done:await c("SELECT COUNT(*) c FROM orders WHERE st='done'"),
      revenue:await c("SELECT COALESCE(SUM(total),0) c FROM orders WHERE st='done'"),subs:await c('SELECT COUNT(*) c FROM subs WHERE exp>?',Date.now()),tickets:await c("SELECT COUNT(*) c FROM tickets WHERE status='open'")});
  }
  if(a==='orders'&&m==='GET'){
    const st=['pending','review','done','rejected'].includes(new URL(req.url).searchParams.get('st'))?new URL(req.url).searchParams.get('st'):'review';
    const rows=(await D.prepare('SELECT o.id,o.items,o.total,o.pm,o.ref,o.st,o.note,o.created,u.username,u.email FROM orders o LEFT JOIN users u ON u.id=o.user_id WHERE o.st=? ORDER BY o.created DESC LIMIT 100').bind(st).all()).results;
    rows.forEach(o=>{try{o.items=JSON.parse(o.items)}catch(e){o.items=[]}});
    return json({rows});
  }
  if(a==='order'&&m==='POST'){
    const o=await D.prepare('SELECT * FROM orders WHERE id=?').bind(clip(b.id,20)).first();
    if(!o||!['pending','review'].includes(o.st))return json({error:'سفارش قابل تغییر نیست.'},400);
    if(b.action==='reject'){await D.prepare("UPDATE orders SET st='rejected',note=? WHERE id=?").bind(clip(b.note,200),o.id).run();return json({ok:true})}
    let items=[];try{items=JSON.parse(o.items)}catch(e){}
    const units=[];items.forEach(i=>{for(let k=0;k<i.q;k++)units.push(i)});
    const links=String(b.links||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    if(links.length!==units.length)return json({error:'تعداد لینک‌ها باید '+units.length+' عدد باشد (هر خط یک لینک).'},400);
    if(links.some(l=>l.length>1500))return json({error:'یکی از لینک‌ها خیلی بلند است.'},400);
    const now=Date.now();
    await D.batch([...units.map((i,k)=>D.prepare('INSERT INTO subs (user_id,order_id,plan,link,exp,created) VALUES (?,?,?,?,?,?)').bind(o.user_id,o.id,i.name,links[k],now+i.days*864e5,now)),D.prepare("UPDATE orders SET st='done',note=? WHERE id=?").bind(clip(b.note,200),o.id)]);
    return json({ok:true});
  }
  if(a==='plans'&&m==='GET')return json({rows:(await D.prepare('SELECT * FROM plans ORDER BY sort,id').all()).results});
  if(a==='plan'&&m==='POST'){
    const name=clip(b.name,40),price=INT(b.price,0,1e10),days=INT(b.days,1,3650),gb=INT(b.gb,0,1e6),sort=INT(b.sort,0,999)||0;
    if(!name||price===null||days===null||gb===null)return json({error:'نام، قیمت، مدت و حجم را درست وارد کن.'},400);
    const feats=clip(b.feats,500),best=b.best?1:0,act=b.active?1:0,id=INT(b.id,1,1e9);
    if(id)await D.prepare('UPDATE plans SET name=?,price=?,days=?,gb=?,feats=?,best=?,active=?,sort=? WHERE id=?').bind(name,price,days,gb,feats,best,act,sort,id).run();
    else await D.prepare('INSERT INTO plans (name,price,days,gb,feats,best,active,sort) VALUES (?,?,?,?,?,?,?,?)').bind(name,price,days,gb,feats,best,act,sort).run();
    return json({ok:true});
  }
  if(a==='plan/delete'&&m==='POST'){await D.prepare('DELETE FROM plans WHERE id=?').bind(INT(b.id,1,1e9)||0).run();return json({ok:true})}
  if(a==='users'&&m==='GET')return json({rows:(await D.prepare('SELECT u.id,u.username,u.email,u.created,u.banned,(SELECT COUNT(*) FROM orders WHERE user_id=u.id) n FROM users u ORDER BY u.id DESC LIMIT 200').all()).results});
  if(a==='user'&&m==='POST'){await D.prepare('UPDATE users SET banned=? WHERE id=?').bind(b.banned?1:0,INT(b.id,1,1e12)||0).run();return json({ok:true})}
  if(a==='tickets'&&m==='GET'){
    const rows=(await D.prepare('SELECT t.id,t.subject,t.status,t.updated,u.username FROM tickets t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.updated DESC LIMIT 60').all()).results;
    if(rows.length){
      const ms=(await D.prepare(`SELECT ticket_id,author,body,created FROM ticket_msgs WHERE ticket_id IN (${rows.map(()=>'?').join(',')}) ORDER BY id`).bind(...rows.map(t=>t.id)).all()).results;
      rows.forEach(t=>t.msgs=ms.filter(x=>x.ticket_id===t.id));
    }
    return json({rows});
  }
  if(a==='ticket'&&m==='POST'){
    const id=clip(b.id,20),now=Date.now(),body=clip(b.body,2000);
    if(body)await D.batch([D.prepare("INSERT INTO ticket_msgs (ticket_id,author,body,created) VALUES (?,'admin',?,?)").bind(id,body,now),D.prepare("UPDATE tickets SET status='answered',updated=? WHERE id=?").bind(now,id)]);
    if(b.status==='closed'||b.status==='open')await D.prepare('UPDATE tickets SET status=? WHERE id=?').bind(b.status,id).run();
    return json({ok:true});
  }
  if(a==='settings'&&m==='GET'){
    const r=await D.prepare("SELECT k,v FROM kv WHERE k IN ('card','card_name','usdt','support','banner','maint','ban')").all(),o={};
    for(const x of r.results)o[x.k]=x.v;
    let bn={},ban=[];try{bn=JSON.parse(o.banner||'{}')}catch(e){}try{ban=JSON.parse(o.ban||'[]')}catch(e){}
    return json({card:o.card||'',card_name:o.card_name||'',usdt:o.usdt||'',support:o.support||'',banner_on:!!bn.on,banner_text:bn.text||'',maint:o.maint==='1',ban:ban.join('\n')});
  }
  if(a==='settings'&&m==='POST'){
    const ban=String(b.ban||'').split(/\s+/).filter(x=>IPRX.test(x)).slice(0,200);
    await D.batch([['card',clip(b.card,40)],['card_name',clip(b.card_name,60)],['usdt',clip(b.usdt,120)],['support',clip(b.support,60)],['banner',JSON.stringify({on:!!b.banner_on,text:clip(b.banner_text,160)})],['maint',b.maint?'1':'0'],['ban',JSON.stringify(ban)]].map(([k,v])=>D.prepare('INSERT OR REPLACE INTO kv (k,v) VALUES (?,?)').bind(k,v)));
    FL.t=0;return json({ok:true});
  }
  if(a==='security'&&m==='GET')return json({twofa:!!(await kvGet(env,'totp')),logs:(await D.prepare('SELECT t,type,ip,info FROM sec_log ORDER BY id DESC LIMIT 40').all()).results,me:ip(req)});
  if(a==='2fa/start'&&m==='POST'){const s=newSecret();await kvSet(env,'totp_new',s);return json({secret:s,uri:'otpauth://totp/VPN-Admin?secret='+s+'&issuer=VPN'})}
  if(a==='2fa/enable'&&m==='POST'){
    const s=await kvGet(env,'totp_new');
    if(!s||!(await totpCheck(env,s,b.code)))return json({error:'کد درست نیست.'},400);
    await kvSet(env,'totp',s);await kvDel(env,'totp_new');return json({ok:true});
  }
  if(a==='2fa/disable'&&m==='POST'){
    if(!(await samePw(String(b.password||''),env)))return json({error:'رمز اشتباه است.'},400);
    await kvDel(env,'totp');return json({ok:true});
  }
  if(a==='logout-all'&&m==='POST'){await kvSet(env,'sv',(await adminVer(env))+1);return json({ok:true},200,{'set-cookie':adminClear})}
  return json({error:'not found'},404);
}

/* ============ router ============ */
async function api(req,env,url){
  const p=url.pathname.replace(/\/+$/,''),m=req.method;
  if(!env.DB)return json({error:'db'},503);
  let b={};
  if(m==='POST'){
    if(!(req.headers.get('content-type')||'').includes('application/json'))return json({error:'bad'},415);
    try{b=await req.json()}catch(e){return json({error:'bad'},400)}
    if(!b||typeof b!=='object')b={};
  }else if(m!=='GET')return json({error:'method'},405);
  return p.startsWith('/api/admin/')?adminApi(req,env,p,m,b):userApi(req,env,p,m,b);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url),p=url.pathname;
    let dp=p;try{dp=decodeURIComponent(p)}catch(e){return text('Bad request',400)}
    if(BAD.test(dp))return text('Not found',404);
    const admin=p==='/admin'||p.startsWith('/admin/')||p==='/admin.html'||p==='/admin.js'||p.startsWith('/api/admin');
    if(env.DB){
      try{await schema(env)}catch(e){}
      const f=await flags(env),cip=request.headers.get('cf-connecting-ip')||'';
      if(cip&&f.ban.has(cip))return text('Forbidden',403);
      if(f.maint&&!admin&&!(await adminOk(request,env))){
        if(p.startsWith('/api/'))return sec(json({error:'maintenance'},503,{'retry-after':'300'}));
        if(request.method==='GET'&&(/\.html$/.test(p)||!/\.[a-z0-9]{2,5}$/i.test(p)))return sec(new Response(MAINT,{status:503,headers:{'content-type':'text/html;charset=utf-8','retry-after':'300','cache-control':'no-store'}}));
      }
    }
    let r;
    try{r=p.startsWith('/api/')?await api(request,env,url):await env.ASSETS.fetch(request)}catch(e){return text('Server error',500)}
    return sec(r,admin);
  }
};
