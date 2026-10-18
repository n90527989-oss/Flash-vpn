(function(){
var d=document.documentElement,$=function(i){return document.getElementById(i)};
var cfg={plans:[],pay:{},support:'',banner:null},ME=null,cart=[],mode='in',tabNow='subs';
try{cart=JSON.parse(localStorage.getItem('cart'))||[]}catch(e){}
function saveCart(){try{localStorage.setItem('cart',JSON.stringify(cart))}catch(e){}}
function fa(n){return Number(n).toLocaleString('fa-IR')}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function dt(t){return new Date(t).toLocaleDateString('fa-IR')}
function api(path,body){
  var o={credentials:'same-origin',headers:{'content-type':'application/json'}};
  if(body){o.method='POST';o.body=JSON.stringify(body)}
  return fetch(path,o).then(function(r){return r.json().catch(function(){return{}}).then(function(j){return{ok:r.ok,s:r.status,j:j}})}).catch(function(){return{ok:false,s:0,j:{error:'ارتباط با سرور برقرار نشد.'}}});
}
var tt;function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2800)}
function plan(id){return cfg.plans.filter(function(p){return p.id===id})[0]}
function total(){return cart.reduce(function(a,i){var p=plan(i.id);return a+(p?p.price*i.q:0)},0)}
function open(el){$('veil').classList.add('on');el.classList.add('on')}
function closeAll(){['veil','drawer','modal'].forEach(function(i){$(i).classList.remove('on')})}

/* ---------- plans / config ---------- */
function renderPlans(){
  var g=$('pg');
  if(!cfg.plans.length){g.innerHTML='<div class="emp">در حال حاضر پلنی فعال نیست.</div>';return}
  g.innerHTML=cfg.plans.map(function(p){
    var f=String(p.feats||'').split('\n').filter(Boolean).map(function(x){return '<li>'+esc(x)+'</li>'}).join('');
    return '<div class="card plan'+(p.best?' best':'')+'">'+(p.best?'<span class="tag">پرفروش‌ترین</span>':'')+'<h3>'+esc(p.name)+'</h3><div class="price">'+fa(p.price)+' <small>تومان</small></div><ul>'+f+'</ul><button class="btn'+(p.best?' pri':'')+'" data-a="add" data-id="'+p.id+'">افزودن به سبد</button></div>';
  }).join('');
}
function renderCfg(){
  renderPlans();
  var b=$('bn');if(cfg.banner){b.textContent=cfg.banner.text;b.hidden=false}else b.hidden=true;
  var s=String(cfg.support||'').replace(/^@/,'');
  $('sup').innerHTML=s?'پشتیبانی: <a href="https://t.me/'+encodeURIComponent(s)+'" rel="noopener">تلگرام @'+esc(s)+'</a>':'';
  cart=cart.filter(function(i){return plan(i.id)});renderCart();
}
function renderCart(){
  var n=cart.reduce(function(a,i){return a+i.q},0),b=$('cc');b.textContent=n?fa(n):'';b.dataset.z=n?'0':'1';
  $('cl').innerHTML=cart.length?cart.map(function(i){var p=plan(i.id);if(!p)return'';return '<div class="ci"><div><b>اشتراک '+esc(p.name)+'</b><small>'+fa(p.price)+' تومان</small></div><div class="q"><button data-a="qty" data-id="'+i.id+'" data-d="-1" aria-label="کم">−</button><b>'+fa(i.q)+'</b><button data-a="qty" data-id="'+i.id+'" data-d="1" aria-label="زیاد">+</button></div></div>'}).join(''):'<div class="emp">سبد خرید خالی است</div>';
  $('ct').textContent=fa(total())+' تومان';saveCart();
}

/* ---------- user ---------- */
function header(){var b=$('ub'),u=ME?ME.user.username:'';if(ME){b.textContent=(u||'?').charAt(0).toUpperCase();b.classList.add('on');b.title=u;b.setAttribute('aria-label',u)}else{b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';b.classList.remove('on');b.title='ورود / ثبت‌نام';b.setAttribute('aria-label','ورود / ثبت‌نام')}}
function loadMe(){return api('/api/me').then(function(r){ME=r.ok?r.j:null;header();return ME})}
function dl(s){return Math.max(0,Math.ceil((s.exp-Date.now())/864e5))}
var STL={pending:['در انتظار پرداخت',''],review:['در حال بررسی','w'],done:['تحویل شد','g'],rejected:['رد شد','r']};
function payBox(o){
  var p=cfg.pay||{},isU=o.pm==='usdt';
  var info=isU?(p.usdt?'آدرس USDT: <code>'+esc(p.usdt)+'</code>':'آدرس کیف پول هنوز ثبت نشده؛ از پشتیبانی بپرس.'):(p.card?'شماره کارت: <code>'+esc(p.card)+'</code>'+(p.card_name?' به نام '+esc(p.card_name):''):'شماره کارت هنوز ثبت نشده؛ از پشتیبانی بپرس.');
  return '<div class="pay">مبلغ <b>'+fa(o.total)+' تومان</b> را واریز کن.<br>'+info+'<div class="lk" style="direction:rtl"><input id="rf-'+esc(o.id)+'" placeholder="شماره پیگیری یا ۴ رقم آخر کارت" value="'+esc(o.ref||'')+'"><button class="btn pri" data-a="ref" data-id="'+esc(o.id)+'">ثبت رسید</button></div></div>';
}
function renderPanel(){
  if(!ME)return;
  var u=ME.user;$('pu').textContent='سلام '+u.username+'، اشتراک‌ها و سفارش‌هایت اینجاست.';
  var h='';
  if(!ME.subs.length)h='<div class="card emp">هنوز اشتراک فعالی نداری. بعد از تأیید پرداخت، لینک اتصال اینجا نمایش داده می‌شود.<br><a class="btn pri" href="#plans" style="margin-top:14px">مشاهده تعرفه‌ها</a></div>';
  ME.subs.forEach(function(s){var n=dl(s);
    h+='<div class="card sub"><h3>اشتراک '+esc(s.plan)+' <span class="pill '+(n?'g':'')+'">'+(n?'فعال':'منقضی')+'</span></h3><div class="row" style="margin-top:10px"><span>زمان باقی‌مانده</span><b>'+fa(n)+' روز</b></div><div class="row"><span>تاریخ پایان</span><b>'+dt(s.exp)+'</b></div><div class="lk"><input readonly value="'+esc(s.link)+'" aria-label="لینک اتصال"><button data-a="copy" data-l="'+esc(s.link)+'">کپی</button></div><button data-a="renew" data-id="'+esc(plan_id(s.plan))+'" style="margin-top:12px">تمدید</button></div>'});
  $('tsubs').innerHTML=h;
  var o=ME.orders.length?ME.orders.map(function(x){var st=STL[x.st]||['',''],items=x.items.map(function(i){return esc(i.name)+(i.q>1?' ×'+fa(i.q):'')}).join('، ');
    return '<div class="card sub"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><b>'+esc(x.id)+'</b> <span class="pill '+st[1]+'">'+st[0]+'</span><br><small style="color:var(--mu)">'+dt(x.created)+' · '+items+' · '+(x.pm==='usdt'?'USDT':'کارت‌به‌کارت')+'</small></div><b>'+fa(x.total)+' تومان</b></div>'+(x.st==='pending'||x.st==='review'?payBox(x):'')+(x.note?'<div class="row" style="margin-top:8px"><span>توضیح</span><b>'+esc(x.note)+'</b></div>':'')+'</div>'}).join(''):'<div class="card emp">هنوز سفارشی ثبت نکرده‌ای.</div>';
  var paid=ME.orders.filter(function(x){return x.st==='done'}).reduce(function(a,x){return a+x.total},0);
  $('tprof').innerHTML='<div class="g2"><div class="card sub"><h3>اطلاعات حساب</h3><div class="row" style="margin-top:8px"><span>نام کاربری</span><b>'+esc(u.username)+'</b></div><div class="row"><span>ایمیل</span><b style="direction:ltr">'+esc(u.email)+'</b></div><div class="row"><span>عضویت از</span><b>'+dt(u.created)+'</b></div><button data-a="logout" style="margin-top:12px">خروج از حساب</button></div><div class="card sub"><h3>تغییر رمز عبور</h3><input id="po" type="password" placeholder="رمز فعلی" dir="ltr" autocomplete="current-password"><input id="pn" type="password" placeholder="رمز جدید" dir="ltr" autocomplete="new-password" style="margin-top:8px"><button class="btn pri" data-a="chpw" style="margin-top:10px">تغییر رمز</button></div></div><div class="row" style="margin:18px 0 8px"><span>سفارش‌ها: <b>'+fa(ME.orders.length)+'</b></span><span>جمع خرید تأییدشده: <b>'+fa(paid)+' تومان</b></span></div><h3 style="margin:8px 0 12px">سفارش‌های من</h3>'+o;
  var t=ME.tickets.map(function(k){return '<div class="card sub"><h3>'+esc(k.subject)+' <span class="pill '+(k.status==='answered'?'g':'')+'">'+(k.status==='closed'?'بسته':k.status==='answered'?'پاسخ داده شد':'باز')+'</span></h3>'+k.msgs.map(function(m){return '<div class="msg '+(m.author==='admin'?'a':'')+'"><small>'+(m.author==='admin'?'پشتیبانی':'شما')+' · '+dt(m.created)+'</small>'+esc(m.body)+'</div>'}).join('')+(k.status==='closed'?'':'<div class="lk" style="direction:rtl"><input id="tr-'+esc(k.id)+'" placeholder="پاسخ شما"><button data-a="treply" data-id="'+esc(k.id)+'">ارسال</button></div>')+'</div>'}).join('');
  $('tsup').innerHTML='<div class="card sub"><h3>تیکت جدید</h3><input id="ts" placeholder="موضوع" maxlength="80"><textarea id="tm" placeholder="مشکل یا سؤالت را بنویس" maxlength="2000" style="margin-top:8px"></textarea><button class="btn pri" data-a="tnew" style="margin-top:10px">ارسال تیکت</button></div>'+t;
}
function plan_id(name){var p=cfg.plans.filter(function(x){return x.name===name})[0];return p?p.id:''}
function tab(t){tabNow=t;['subs','prof','sup'].forEach(function(k){$('t'+k).hidden=k!==t});document.querySelectorAll('[data-a=tab]').forEach(function(b){b.setAttribute('aria-pressed',b.dataset.t===t)});renderPanel()}
function route(){
  var p=location.hash==='#/panel';
  if(p&&!ME){location.hash='';showAuth();return}
  $('home').hidden=p;$('panel').hidden=!p;if(p){renderPanel();window.scrollTo(0,0)}
}
function showAuth(){open($('modal'))}
function after(){return loadMe().then(function(){closeAll();$('pwd').value='';if(cart.length)A.cart();else location.hash='#/panel';route()})}

var A={
  cart:function(){renderCart();open($('drawer'))},
  close:closeAll,
  user:function(){if(ME){location.hash='#/panel';closeAll();route()}else showAuth()},
  add:function(e){var id=+e.dataset.id;if(!id||!plan(id))return;var i=cart.filter(function(c){return c.id===id})[0];if(i)i.q=Math.min(10,i.q+1);else cart.push({id:id,q:1});renderCart();open($('drawer'))},
  qty:function(e){var id=+e.dataset.id,i=cart.filter(function(c){return c.id===id})[0];if(!i)return;i.q+=+e.dataset.d;if(i.q<1)cart.splice(cart.indexOf(i),1);if(i&&i.q>10)i.q=10;renderCart()},
  renew:function(e){A.add(e)},
  mode:function(e){mode=e.dataset.m;document.querySelectorAll('[data-a=mode]').forEach(function(b){b.setAttribute('aria-pressed',b===e)});$('nmw').hidden=mode==='in';$('eml').textContent=mode==='in'?'ایمیل یا نام کاربری':'ایمیل';$('pwd').autocomplete=mode==='in'?'current-password':'new-password'},
  auth:function(){
    var em=$('em').value.trim(),pw=$('pwd').value,nm=$('nm').value.trim();
    var req=mode==='up'?api('/api/auth/register',{username:nm,email:em,password:pw}):api('/api/auth/login',{id:em,password:pw});
    req.then(function(r){if(!r.ok){toast(r.j.error||'خطا در ورود');return}toast(mode==='up'?'حساب ساخته شد':'خوش آمدی');after()});
  },
  logout:function(){api('/api/auth/logout',{}).then(function(){ME=null;header();location.hash='';route();toast('از حساب خارج شدی')})},
  tab:function(e){tab(e.dataset.t)},
  copy:function(e){try{navigator.clipboard.writeText(e.dataset.l);toast('لینک کپی شد')}catch(x){toast('کپی نشد؛ دستی کپی کن')}},
  checkout:function(){
    if(!cart.length){toast('سبد خرید خالی است');return}
    if(!ME){closeAll();showAuth();return}
    api('/api/orders',{items:cart,pm:$('pm').value}).then(function(r){
      if(!r.ok){toast(r.j.error||'ثبت سفارش انجام نشد');return}
      cart=[];renderCart();closeAll();loadMe().then(function(){location.hash='#/panel';route();tab('prof');toast('سفارش ثبت شد؛ مبلغ را واریز و رسید را ثبت کن')});
    });
  },
  ref:function(e){var v=($('rf-'+e.dataset.id)||{}).value;api('/api/orders/ref',{id:e.dataset.id,ref:v}).then(function(r){if(!r.ok){toast(r.j.error||'خطا');return}toast('رسید ثبت شد؛ بعد از بررسی لینک تحویل می‌شود');loadMe().then(renderPanel)})},
  chpw:function(){api('/api/me/password',{old:$('po').value,new:$('pn').value}).then(function(r){toast(r.ok?'رمز تغییر کرد':(r.j.error||'خطا'));if(r.ok){$('po').value='';$('pn').value=''}})},
  tnew:function(){api('/api/tickets',{subject:$('ts').value,message:$('tm').value}).then(function(r){if(!r.ok){toast(r.j.error||'خطا');return}toast('تیکت ارسال شد');loadMe().then(function(){tab('sup')})})},
  treply:function(e){api('/api/tickets/reply',{id:e.dataset.id,body:($('tr-'+e.dataset.id)||{}).value}).then(function(r){if(!r.ok){toast(r.j.error||'خطا');return}loadMe().then(function(){tab('sup')})})}
};
document.addEventListener('click',function(ev){var e=ev.target.closest('[data-a]');if(!e)return;if(e.id==='veil'&&ev.target!==e)return;var f=A[e.dataset.a];if(f)f(e)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')closeAll()});
window.addEventListener('hashchange',route);
$('theme').onclick=function(){var n=d.dataset.theme==='dark'?'light':'dark';d.dataset.theme=n;try{localStorage.setItem('th',n)}catch(e){}};

/* ---------- decoration ---------- */
var L=['Germany','Netherlands','Turkey','UAE','Finland','UK','USA','France','Sweden','Canada'],h='';
for(var k=0;k<2;k++)L.forEach(function(c){h+='<span><i>●</i> <b>'+c+'</b> · '+(18+Math.floor(Math.random()*60))+' ms</span>'});
$('tape').innerHTML=h+h;
document.addEventListener('pointermove',function(ev){var c=ev.target.closest&&ev.target.closest('.card');if(!c)return;var r=c.getBoundingClientRect();c.style.setProperty('--mx',(ev.clientX-r.left)+'px');c.style.setProperty('--my',(ev.clientY-r.top)+'px')});
document.querySelectorAll('[data-to]').forEach(function(e){var to=parseFloat(e.dataset.to),s=e.dataset.s,t0=null;function f(ts){if(!t0)t0=ts;var p=Math.min((ts-t0)/1600,1),v=to*(1-Math.pow(1-p,3));e.textContent=(to%1?v.toFixed(1):Math.round(v))+s;if(p<1)requestAnimationFrame(f)}requestAnimationFrame(f)});
if('IntersectionObserver' in window){var io=new IntersectionObserver(function(en){en.forEach(function(x){if(x.isIntersecting){x.target.classList.add('in');io.unobserve(x.target)}})},{threshold:.12});document.querySelectorAll('.rv').forEach(function(e){io.observe(e)})}else document.querySelectorAll('.rv').forEach(function(e){e.classList.add('in')});

/* ---------- boot ---------- */
header();renderCart();
api('/api/config').then(function(r){if(r.ok){cfg=r.j;renderCfg()}else $('pg').innerHTML='<div class="emp">بارگذاری تعرفه‌ها انجام نشد. بعداً دوباره سر بزن.</div>'});
loadMe().then(route);
})();
