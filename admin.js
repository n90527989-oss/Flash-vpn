(function(){
var $=function(i){return document.getElementById(i)},R=$('app'),tabNow='stats',need2=false;
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function fa(n){return Number(n).toLocaleString('fa-IR')}
function dt(t){return new Date(t).toLocaleString('fa-IR')}
var tt;function toast(m){var t=$('toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){t.classList.remove('on')},2600)}
function api(p,b){var o={credentials:'same-origin',headers:{'content-type':'application/json'}};if(b){o.method='POST';o.body=JSON.stringify(b)}
  return fetch('/api/admin/'+p,o).then(function(r){return r.json().catch(function(){return{}}).then(function(j){if(r.status===401&&p!=='login'&&j.error==='auth'){login();return{ok:false,j:j,s:401}}return{ok:r.ok,j:j,s:r.status}})}).catch(function(){return{ok:false,j:{error:'ارتباط برقرار نشد'},s:0}})}
function val(i){var e=$(i);return e?e.value:''}
function login(msg){
  R.innerHTML='<div class="card lg2"><h1>ورود به پنل مدیریت</h1><label style="color:var(--mu)" for="pw">رمز مدیر</label><input id="pw" type="password" autocomplete="current-password" dir="ltr">'+(need2?'<label style="color:var(--mu);display:block;margin-top:8px" for="cd">کد دومرحله‌ای</label><input id="cd" inputmode="numeric" maxlength="6" dir="ltr" autocomplete="one-time-code">':'')+'<p class="err" id="er">'+esc(msg||'')+'</p><button class="btn pri" id="go" style="width:100%">ورود</button></div>';
  var go=function(){api('login',{password:val('pw'),code:val('cd')}).then(function(r){
    if(r.j.need2fa){need2=true;login();return}
    if(!r.ok){$('er').textContent=r.j.error==='locked'?'به‌دلیل تلاش زیاد، ۱۵ دقیقه قفل شد.':(r.j.error==='setup'?'ADMIN_PASSWORD یا SESSION_SECRET تنظیم نشده.':'رمز یا کد اشتباه است.');return}
    need2=false;shell()})};
  $('go').onclick=go;$('pw').addEventListener('keydown',function(e){if(e.key==='Enter')go()});
}
var TABS=[['stats','آمار'],['orders','سفارش‌ها'],['plans','پلن‌ها'],['users','کاربران'],['tickets','تیکت‌ها'],['settings','تنظیمات'],['sec','امنیت']];
function shell(){
  R.innerHTML='<div class="ad"><div class="top"><h1>پنل مدیریت</h1><div><button id="th">◐</button> <button id="lo">خروج</button></div></div><div class="nav">'+TABS.map(function(t){return '<button data-t="'+t[0]+'" aria-pressed="'+(t[0]===tabNow)+'">'+t[1]+'</button>'}).join('')+'</div><div id="v"></div></div>';
  $('lo').onclick=function(){api('logout',{}).then(function(){login()})};
  $('th').onclick=function(){var d=document.documentElement,n=d.dataset.theme==='dark'?'light':'dark';d.dataset.theme=n;try{localStorage.setItem('th',n)}catch(e){}};
  R.querySelectorAll('.nav button').forEach(function(b){b.onclick=function(){tabNow=b.dataset.t;R.querySelectorAll('.nav button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});view()}});
  view();
}
var ordSt='review';
function view(){var v=$('v');v.innerHTML='<p style="color:var(--mu)">در حال بارگذاری…</p>';({stats:vStats,orders:vOrders,plans:vPlans,users:vUsers,tickets:vTickets,settings:vSettings,sec:vSec})[tabNow](v)}
function vStats(v){api('stats').then(function(r){if(!r.ok)return;var s=r.j;
  var k=[['کاربران',fa(s.users)],['سفارش در انتظار بررسی',fa(s.review)],['در انتظار پرداخت',fa(s.pending)],['تحویل‌شده',fa(s.done)],['اشتراک فعال',fa(s.subs)],['تیکت باز',fa(s.tickets)],['درآمد (تومان)',fa(s.revenue)]];
  v.innerHTML='<div class="kp">'+k.map(function(x){return '<div class="card"><small>'+x[0]+'</small><b>'+x[1]+'</b></div>'}).join('')+'</div>'})}
function vOrders(v){
  var chips=[['review','در انتظار بررسی'],['pending','در انتظار پرداخت'],['done','تحویل‌شده'],['rejected','ردشده']];
  api('orders?st='+ordSt).then(function(r){if(!r.ok)return;
    var h='<div class="nav">'+chips.map(function(c){return '<button data-s="'+c[0]+'" aria-pressed="'+(c[0]===ordSt)+'">'+c[1]+'</button>'}).join('')+'</div>';
    if(!r.j.rows.length)h+='<div class="card it emp" style="color:var(--mu)">سفارشی در این بخش نیست.</div>';
    r.j.rows.forEach(function(o){var units=o.items.reduce(function(a,i){return a+i.q},0);
      h+='<div class="card it"><div class="r"><div><b>'+esc(o.id)+'</b> · '+esc(o.username||'—')+' <small style="color:var(--mu)">'+esc(o.email||'')+'</small><br><small style="color:var(--mu)">'+dt(o.created)+' · '+o.items.map(function(i){return esc(i.name)+' ×'+fa(i.q)}).join('، ')+' · '+(o.pm==='usdt'?'USDT':'کارت‌به‌کارت')+'</small></div><b>'+fa(o.total)+' تومان</b></div>'+(o.ref?'<div style="margin-top:8px">رسید: <code>'+esc(o.ref)+'</code></div>':'')+(o.note?'<div style="color:var(--mu)">توضیح: '+esc(o.note)+'</div>':'')
      +(o.st==='review'||o.st==='pending'?'<label>لینک اشتراک‌ها ('+fa(units)+' عدد، هر خط یک لینک)</label><textarea id="l-'+esc(o.id)+'" dir="ltr"></textarea><label>توضیح برای کاربر (اختیاری)</label><input id="n-'+esc(o.id)+'" maxlength="200"><div style="display:flex;gap:8px;margin-top:10px"><button class="btn pri sm" data-ok="'+esc(o.id)+'">تأیید و تحویل</button><button class="sm" data-no="'+esc(o.id)+'">رد سفارش</button></div>':'')+'</div>'});
    v.innerHTML=h;
    v.querySelectorAll('[data-s]').forEach(function(b){b.onclick=function(){ordSt=b.dataset.s;view()}});
    v.querySelectorAll('[data-ok]').forEach(function(b){b.onclick=function(){api('order',{id:b.dataset.ok,action:'done',links:val('l-'+b.dataset.ok),note:val('n-'+b.dataset.ok)}).then(function(x){toast(x.ok?'تحویل داده شد':(x.j.error||'خطا'));if(x.ok)view()})}});
    v.querySelectorAll('[data-no]').forEach(function(b){b.onclick=function(){if(!confirm('سفارش رد شود؟'))return;api('order',{id:b.dataset.no,action:'reject',note:val('n-'+b.dataset.no)}).then(function(x){toast(x.ok?'رد شد':(x.j.error||'خطا'));if(x.ok)view()})}});
  })}
function planForm(p){var id=p.id||'n';return '<div class="card it"><div class="fg"><div><label>نام</label><input id="pn-'+id+'" value="'+esc(p.name||'')+'"></div><div><label>قیمت (تومان)</label><input id="pp-'+id+'" type="number" value="'+(p.price||0)+'" dir="ltr"></div><div><label>مدت (روز)</label><input id="pd-'+id+'" type="number" value="'+(p.days||30)+'" dir="ltr"></div><div><label>حجم (گیگ، ۰ = نامحدود)</label><input id="pg-'+id+'" type="number" value="'+(p.gb||0)+'" dir="ltr"></div><div><label>ترتیب</label><input id="ps-'+id+'" type="number" value="'+(p.sort||0)+'" dir="ltr"></div></div><label>ویژگی‌ها (هر خط یک مورد)</label><textarea id="pf-'+id+'">'+esc(p.feats||'')+'</textarea><div class="ck"><input id="pb-'+id+'" type="checkbox"'+(p.best?' checked':'')+'><label style="margin:0">پرفروش‌ترین</label> <input id="pa-'+id+'" type="checkbox"'+(p.active!==0?' checked':'')+' style="margin-right:14px"><label style="margin:0">فعال</label></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn pri sm" data-sv="'+id+'">ذخیره</button>'+(p.id?'<button class="sm" data-dl="'+p.id+'">حذف</button>':'')+'</div></div>'}
function vPlans(v){api('plans').then(function(r){if(!r.ok)return;
  v.innerHTML='<button class="btn pri sm" id="np" style="margin-bottom:12px">پلن جدید</button><div id="nf"></div>'+r.j.rows.map(planForm).join('');
  $('np').onclick=function(){$('nf').innerHTML=planForm({});bind()};bind();
  function bind(){v.querySelectorAll('[data-sv]').forEach(function(b){b.onclick=function(){var i=b.dataset.sv;api('plan',{id:i==='n'?0:+i,name:val('pn-'+i),price:val('pp-'+i),days:val('pd-'+i),gb:val('pg-'+i),sort:val('ps-'+i),feats:val('pf-'+i),best:$('pb-'+i).checked,active:$('pa-'+i).checked}).then(function(x){toast(x.ok?'ذخیره شد':(x.j.error||'خطا'));if(x.ok)view()})}});
    v.querySelectorAll('[data-dl]').forEach(function(b){b.onclick=function(){if(!confirm('پلن حذف شود؟ (به‌جای حذف می‌توانی غیرفعالش کنی)'))return;api('plan/delete',{id:+b.dataset.dl}).then(function(){view()})}})}})}
function vUsers(v){api('users').then(function(r){if(!r.ok)return;
  v.innerHTML=r.j.rows.length?r.j.rows.map(function(u){return '<div class="card it"><div class="r"><div><b>'+esc(u.username)+'</b> <small style="color:var(--mu)">'+esc(u.email)+' · '+dt(u.created)+' · '+fa(u.n)+' سفارش</small></div><button class="sm" data-b="'+u.id+'" data-v="'+(u.banned?0:1)+'">'+(u.banned?'رفع مسدودی':'مسدود کردن')+'</button></div></div>'}).join(''):'<div class="card it" style="color:var(--mu)">هنوز کاربری ثبت‌نام نکرده.</div>';
  v.querySelectorAll('[data-b]').forEach(function(b){b.onclick=function(){api('user',{id:+b.dataset.b,banned:b.dataset.v==='1'}).then(function(){view()})}})})}
function vTickets(v){api('tickets').then(function(r){if(!r.ok)return;
  v.innerHTML=r.j.rows.length?r.j.rows.map(function(t){return '<div class="card it"><div class="r"><b>'+esc(t.subject)+' <small style="color:var(--mu)">'+esc(t.username||'')+' · '+esc(t.status)+'</small></b><button class="sm" data-c="'+esc(t.id)+'" data-s="'+(t.status==='closed'?'open':'closed')+'">'+(t.status==='closed'?'بازکردن':'بستن')+'</button></div>'+t.msgs.map(function(m){return '<div class="msg '+(m.author==='admin'?'a':'')+'"><small>'+(m.author==='admin'?'شما':'کاربر')+' · '+dt(m.created)+'</small>'+esc(m.body)+'</div>'}).join('')+'<textarea id="r-'+esc(t.id)+'" placeholder="پاسخ"></textarea><button class="btn pri sm" data-r="'+esc(t.id)+'" style="margin-top:8px">ارسال پاسخ</button></div>'}).join(''):'<div class="card it" style="color:var(--mu)">تیکتی نیست.</div>';
  v.querySelectorAll('[data-r]').forEach(function(b){b.onclick=function(){api('ticket',{id:b.dataset.r,body:val('r-'+b.dataset.r)}).then(function(x){toast(x.ok?'ارسال شد':'خطا');view()})}});
  v.querySelectorAll('[data-c]').forEach(function(b){b.onclick=function(){api('ticket',{id:b.dataset.c,status:b.dataset.s}).then(function(){view()})}})})}
function vSettings(v){api('settings').then(function(r){if(!r.ok)return;var s=r.j;
  v.innerHTML='<div class="card it"><h3 style="margin:0 0 6px">اطلاعات پرداخت</h3><label>شماره کارت</label><input id="s1" value="'+esc(s.card)+'" dir="ltr"><label>نام صاحب کارت</label><input id="s2" value="'+esc(s.card_name)+'"><label>آدرس کیف پول USDT</label><input id="s3" value="'+esc(s.usdt)+'" dir="ltr"><label>آیدی تلگرام پشتیبانی (بدون @)</label><input id="s4" value="'+esc(s.support)+'" dir="ltr"></div><div class="card it"><h3 style="margin:0 0 6px">بنر بالای سایت</h3><div class="ck"><input id="s5" type="checkbox"'+(s.banner_on?' checked':'')+'><label style="margin:0">نمایش بنر</label></div><label>متن بنر</label><input id="s6" value="'+esc(s.banner_text)+'" maxlength="160"></div><div class="card it"><h3 style="margin:0 0 6px">نگه‌داری و مسدودسازی</h3><div class="ck"><input id="s7" type="checkbox"'+(s.maint?' checked':'')+'><label style="margin:0">نمایش «در حال به‌روزرسانی» به بازدیدکننده‌ها (مدیر سایت را عادی می‌بیند)</label></div><label>آی‌پی‌های مسدود (هر خط یکی)</label><textarea id="s8" dir="ltr">'+esc(s.ban)+'</textarea></div><button class="btn pri" id="ss">ذخیره تنظیمات</button>';
  $('ss').onclick=function(){api('settings',{card:val('s1'),card_name:val('s2'),usdt:val('s3'),support:val('s4'),banner_on:$('s5').checked,banner_text:val('s6'),maint:$('s7').checked,ban:val('s8')}).then(function(x){toast(x.ok?'ذخیره شد':'خطا')})}})}
function vSec(v){api('security').then(function(r){if(!r.ok)return;var s=r.j;
  v.innerHTML='<div class="card it"><h3 style="margin:0 0 6px">ورود دومرحله‌ای (Google Authenticator)</h3><p style="color:var(--mu)">وضعیت: <b>'+(s.twofa?'فعال':'غیرفعال')+'</b></p><div id="tf">'+(s.twofa?'<label>برای غیرفعال‌کردن، رمز مدیر را وارد کن</label><input id="dp" type="password" dir="ltr"><button class="sm" id="d2" style="margin-top:8px">غیرفعال‌سازی</button>':'<button class="btn pri sm" id="e1">شروع فعال‌سازی</button>')+'</div></div><div class="card it"><h3 style="margin:0 0 6px">خروج از همه‌ی دستگاه‌ها</h3><p style="color:var(--mu)">همه‌ی نشست‌های مدیریت باطل می‌شود.</p><button class="sm" id="la">خروج همه</button></div><div class="card it"><h3 style="margin:0 0 6px">رویدادهای امنیتی (آی‌پی تو: '+esc(s.me)+')</h3><div class="log">'+s.logs.map(function(l){return esc(dt(l.t))+' · '+esc(l.type)+' · '+esc(l.ip)+' '+esc(l.info)}).join('<br>')+'</div></div>';
  if($('e1'))$('e1').onclick=function(){api('2fa/start',{}).then(function(x){$('tf').innerHTML='<p>این کد را در برنامه‌ی Google Authenticator یا Authy به‌صورت دستی وارد کن:</p><code>'+esc(x.j.secret)+'</code><label style="color:var(--mu);display:block;margin-top:10px">کد ۶ رقمی برنامه</label><input id="ec" inputmode="numeric" maxlength="6" dir="ltr"><button class="btn pri sm" id="e2" style="margin-top:8px">تأیید و فعال‌سازی</button>';$('e2').onclick=function(){api('2fa/enable',{code:val('ec')}).then(function(y){toast(y.ok?'فعال شد':(y.j.error||'خطا'));if(y.ok)view()})}})};
  if($('d2'))$('d2').onclick=function(){api('2fa/disable',{password:val('dp')}).then(function(y){toast(y.ok?'غیرفعال شد':(y.j.error||'خطا'));if(y.ok)view()})};
  $('la').onclick=function(){api('logout-all',{}).then(function(){login()})}})}
api('me').then(function(r){if(r.ok)shell();else login()});
})();
