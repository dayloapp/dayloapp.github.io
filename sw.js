// Daylo service worker: makes the app open fast and work offline.
const CACHE='daylo-v81';
const SHELL=['./','./index.html','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const req=e.request;if(req.method!=='GET')return;
  const url=new URL(req.url);
  const isFont=url.hostname==='fonts.googleapis.com'||url.hostname==='fonts.gstatic.com';
  if(url.origin!==location.origin&&!isFont)return;
  if(url.searchParams.has('fresh'))return; // update checks always go to the network
  // Network first for the page itself (so updates show up), cache first for everything else.
  if(req.mode==='navigate'){
    // Always ask the server for the newest page (skip the phone's HTTP cache). If the network is slow, show the saved copy after 6 s.
    const net=fetch(req.url,{cache:'no-store',credentials:'same-origin'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',cp))}return r});
    const slow=new Promise(res=>setTimeout(()=>caches.match('./index.html').then(h=>h&&res(h)),6000));
    e.respondWith(Promise.race([net,slow]).catch(()=>caches.match('./index.html')));return}
  e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok||r.type==='opaque'){const cp=r.clone();caches.open(CACHE).then(c=>c.put(req,cp))}return r})));
});

// Tapping a notification opens Daylo on the right page.
self.addEventListener('notificationclick',e=>{e.notification.close();const url=new URL((e.notification.data&&e.notification.data.url)||'./',self.registration.scope).href;
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{for(const c of cs){if(c.url.startsWith(self.registration.scope)&&'focus' in c){if(c.navigate)c.navigate(url).catch(()=>{});return c.focus()}}return clients.openWindow(url)}))});
// Morning check while the app is closed (Android Chrome, installed app).
self.addEventListener('periodicsync',e=>{if(e.tag==='daylo-check')e.waitUntil(morningCheck())});
function idb(fn){return new Promise(res=>{const r=indexedDB.open('creator-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>{try{fn(r.result.transaction('kv','readwrite').objectStore('kv'),res)}catch(e){res(null)}};r.onerror=()=>res(null)})}
const idbGet=k=>idb((st,res)=>{const q=st.get(k);q.onsuccess=()=>res(q.result);q.onerror=()=>res(null)});
const idbSet=(k,v)=>idb((st,res)=>{const q=st.put(v,k);q.onsuccess=()=>res(true);q.onerror=()=>res(null)});
async function morningCheck(){const cur=await idbGet('cur');if(!cur)return;const st=await idbGet('state:'+cur);if(!st||!st.settings||!st.settings.notifOn)return;
  const d=new Date();if(d.getHours()<7)return;const t=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  if((await idbGet('lastSummary:'+cur))===t)return;
  const open=(st.tasks||[]).filter(x=>!x.done&&x.due);const late=open.filter(x=>x.due<t).length,due=open.filter(x=>x.due===t).length;
  await idbSet('lastSummary:'+cur,t);
  if(self.navigator.setAppBadge){try{late+due?await self.navigator.setAppBadge(late+due):await self.navigator.clearAppBadge()}catch(e){}}
  if(!late&&!due)return;
  await self.registration.showNotification('Your day in Daylo',{body:[due&&due+' due today',late&&late+' late'].filter(Boolean).join(' · '),tag:'daylo-summary',icon:'icons/icon-192.png',badge:'icons/icon-192.png',data:{url:'./#schedule'}})}
