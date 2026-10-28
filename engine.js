// engine.js — движок qwerty. Один и тот же код работает и в редакторе (кнопка «Играть»), и в готовой игре (.html).
(()=>{
const T=window.THREE;
const ROLES={decor:['🎨','Декор'],wall:['🧱','Твёрдое'],coin:['⭐','Собрать'],hazard:['☠️','Опасность'],goal:['🏁','Финиш'],patrol:['👾','Враг ходит']};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const box=r=>{r.updateMatrixWorld(true);return new T.Box3().setFromObject(r)};
const el=(css,html)=>{const e=document.createElement('div');e.style.cssText=css;if(html!=null)e.innerHTML=html;return e};
const FONT='font:700 16px system-ui,sans-serif;color:#fff;';

function makeAnim(r,clipsOf){
 const cl=clipsOf(r);if(!cl.length)return null;
 const f=re=>cl.find(c=>re.test(c.name)),m=new T.AnimationMixer(r);
 const a={m,idle:f(/idle|survey|stand/i),run:f(/run|gallop/i),jump:f(/jump/i),first:cl[0],cur:null};
 a.walk=f(/walk/i)||f(/run|gallop|fly|flap/i);
 a.play=c=>{if(!c)return;const n=m.clipAction(c);if(a.cur===n)return;if(a.cur)a.cur.fadeOut(.2);n.reset().fadeIn(.2).play();a.cur=n};
 a.stop=()=>{if(a.cur){a.cur.fadeOut(.2);a.cur=null}};
 return a;
}
function setState(a,s,mag){
 if(!a)return;
 if(s==='jump'&&a.jump)return a.play(a.jump);
 if(s==='move'||s==='jump')return a.play((mag>.85&&a.run)||a.walk||a.run||a.first);
 if(a.idle)return a.play(a.idle);
 a.stop();
}

function create(o){
 const {scene,camera,dom,roots}=o,clipsOf=o.clips||(()=>[]);
 const pl=roots.find(r=>r.userData.isPlayer);
 if(!pl)return null;
 const role=r=>r.userData.role||'decor';
 const pb=box(pl),ps=pb.getSize(new T.Vector3());
 const H=clamp(ps.y,.3,6),R=clamp(Math.min(ps.x,ps.z)*.45,.2,.7),foot=pl.position.y-pb.min.y;
 const start=pl.position.clone(),startRy=pl.rotation.y,face=pl.userData.face||0;
 const SPD=3.4*clamp(H/1.8,.6,2.2)*(pl.userData.pspeed||1);
 const others=roots.filter(r=>r!==pl);
 const walls=others.filter(r=>role(r)==='wall').map(box);
 const hazards=others.filter(r=>role(r)==='hazard').map(box);
 const goals=others.filter(r=>role(r)==='goal').map(box);
 const coins=others.filter(r=>role(r)==='coin').map(r=>{const b=box(r);return{r,c:b.getCenter(new T.Vector3()),top:b.max.y,bot:b.min.y,orig:r.visible,y0:r.position.y,got:false}});
 const patrols=others.filter(r=>role(r)==='patrol').map(r=>({r,p0:r.position.clone(),ry:r.rotation.y,b0:box(r),t:Math.random()*6,a:makeAnim(r,clipsOf)}));
 const mixers=[],pa=makeAnim(pl,clipsOf);
 if(pa)mixers.push(pa.m);
 patrols.forEach(p=>p.a&&mixers.push(p.a.m));
 others.forEach(r=>{if(['patrol','coin','hazard','goal'].includes(role(r)))return;const a=makeAnim(r,clipsOf);if(a){a.play(a.idle||a.first);mixers.push(a.m)}});
 const total=coins.length;
 let score=0,done=false,inv=0,vx=0,vz=0,vy=0,on=true,jumpReq=false,heading=startRy-face,t=0;
 let yaw=Math.atan2(camera.position.x-start.x,camera.position.z-start.z),pitch=.35;
 const dist=clamp(H*3.2,2.5,12);
 const joy={x:0,y:0},keys=new Set();
 let nx=start.x,nz=start.z,ny=start.y-foot;

 /* ---- экран игры ---- */
 const ui=el('position:fixed;inset:0;pointer-events:none;z-index:40;touch-action:none;'+FONT);
 const sc=el('position:absolute;top:14px;left:0;right:0;text-align:center;font-size:20px;text-shadow:0 2px 6px #000a');
 const ms=el('position:absolute;top:22%;left:0;right:0;text-align:center;font-size:22px;text-shadow:0 2px 8px #000;opacity:0;transition:opacity .25s');
 ui.append(sc,ms);
 const btn=(css,txt,fn)=>{const b=el('position:absolute;pointer-events:auto;background:#241d47cc;border:2px solid #ffffff55;border-radius:16px;padding:10px 14px;'+css,txt);b.addEventListener('pointerdown',e=>{e.stopPropagation();fn()});return b};
 if(!o.restartOnly)ui.append(btn('top:12px;left:12px;','✕ Выйти',()=>o.onExit&&o.onExit()));
 ui.append(btn('top:12px;right:12px;','↻',()=>reset()));
 const zone=el('position:absolute;left:22px;bottom:34px;width:140px;height:140px;border-radius:50%;background:#ffffff22;border:2px solid #ffffff44;pointer-events:auto;touch-action:none');
 const knob=el('position:absolute;left:45px;top:45px;width:50px;height:50px;border-radius:50%;background:#5ef2c1cc');
 zone.append(knob);ui.append(zone);
 let zid=null;
 const zset=e=>{const r=zone.getBoundingClientRect();let dx=(e.clientX-r.left-70)/60,dy=(e.clientY-r.top-70)/60;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}joy.x=dx;joy.y=dy;knob.style.left=45+dx*45+'px';knob.style.top=45+dy*45+'px'};
 zone.addEventListener('pointerdown',e=>{e.stopPropagation();zid=e.pointerId;zone.setPointerCapture(zid);zset(e)});
 zone.addEventListener('pointermove',e=>{if(e.pointerId===zid)zset(e)});
 const zend=e=>{if(e.pointerId!==zid)return;zid=null;joy.x=joy.y=0;knob.style.left=knob.style.top='45px'};
 zone.addEventListener('pointerup',zend);zone.addEventListener('pointercancel',zend);
 const jb=el('position:absolute;right:26px;bottom:48px;width:84px;height:84px;border-radius:50%;background:#ffd36bcc;color:#2a2000;display:grid;place-items:center;pointer-events:auto;touch-action:none;font-size:15px','ПРЫЖОК');
 jb.addEventListener('pointerdown',e=>{e.stopPropagation();jumpReq=true});ui.append(jb);
 const win=el('position:absolute;inset:0;display:none;place-items:center;background:#000a;pointer-events:auto','<div style="background:#241d47;border:2px solid #5ef2c1;border-radius:24px;padding:26px 30px;text-align:center"><div style="font-size:30px;margin-bottom:8px">🏆 Победа!</div><div id="qwb"></div></div>');
 const wb=btn('position:static;display:inline-block;margin:10px 6px 0','Играть ещё',()=>reset());
 win.firstChild.append(wb);
 if(!o.restartOnly)win.firstChild.append(btn('position:static;display:inline-block;margin:10px 6px 0','Выйти',()=>o.onExit&&o.onExit()));
 ui.append(win);document.body.append(ui);

 let mt=0;
 function ms_(m,d=1400){ms.textContent=m;ms.style.opacity=1;clearTimeout(mt);mt=setTimeout(()=>ms.style.opacity=0,d)}
 const hud=()=>{sc.textContent=total?'⭐ '+score+' / '+total:''};hud();

 /* ---- ввод ---- */
 let cid=null,lx=0,ly=0;
 const pd=e=>{if(cid===null){cid=e.pointerId;lx=e.clientX;ly=e.clientY}};
 const pm=e=>{if(e.pointerId!==cid)return;yaw-=(e.clientX-lx)*.006;pitch=clamp(pitch+(e.clientY-ly)*.005,-.15,1.3);lx=e.clientX;ly=e.clientY};
 const pu=e=>{if(e.pointerId===cid)cid=null};
 dom.addEventListener('pointerdown',pd);dom.addEventListener('pointermove',pm);dom.addEventListener('pointerup',pu);dom.addEventListener('pointercancel',pu);
 const kd=e=>{const k=e.key.toLowerCase();if(k===' '){jumpReq=true;e.preventDefault()}keys.add(k)},ku=e=>keys.delete(e.key.toLowerCase());
 addEventListener('keydown',kd);addEventListener('keyup',ku);

 function respawn(text){nx=start.x;nz=start.z;ny=start.y-foot;vy=0;vx=vz=0;inv=1.2;ms_(text)}
 function reset(){score=0;done=false;win.style.display='none';coins.forEach(c=>{c.got=false;c.r.visible=c.orig});heading=startRy-face;respawn('Поехали!');hud()}
 const hit=(b,pad)=>nx>b.min.x-R*pad&&nx<b.max.x+R*pad&&nz>b.min.z-R*pad&&nz<b.max.z+R*pad&&ny<b.max.y&&ny+H>b.min.y;

 function update(dt){
  t+=dt;mixers.forEach(m=>m.update(dt));
  coins.forEach(c=>{if(!c.got){c.r.rotation.y+=dt*2;c.r.position.y=c.y0+Math.sin(t*3)*.08}});
  if(!done){
   inv=Math.max(0,inv-dt);
   const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
   let ax=(keys.has('d')||keys.has('arrowright')?1:0)-(keys.has('a')||keys.has('arrowleft')?1:0)+joy.x;
   let af=(keys.has('w')||keys.has('arrowup')?1:0)-(keys.has('s')||keys.has('arrowdown')?1:0)-joy.y;
   let mag=Math.hypot(ax,af);if(mag>1){ax/=mag;af/=mag;mag=1}
   const mx=fx*af+rx*ax,mz=fz*af+rz*ax;
   vx=mx*SPD;vz=mz*SPD;
   if(mag>.05){let d=Math.atan2(mx,mz)-heading;d=Math.atan2(Math.sin(d),Math.cos(d));heading+=d*Math.min(1,dt*12)}
   pl.rotation.y=heading+face;
   if(jumpReq&&on){vy=7.2;on=false}jumpReq=false;
   vy-=22*dt;
   let px=nx+vx*dt,pz=nz+vz*dt,py=ny+vy*dt;on=false;
   if(py<=0){py=0;vy=0;on=true}
   for(const b of walls){
    const over=px>b.min.x-R*.6&&px<b.max.x+R*.6&&pz>b.min.z-R*.6&&pz<b.max.z+R*.6;
    if(over&&ny>=b.max.y-.3&&py<=b.max.y&&vy<=0){py=b.max.y;vy=0;on=true;continue}
    if(py<b.max.y-.3&&py+H>b.min.y){
     const cx=clamp(px,b.min.x,b.max.x),cz=clamp(pz,b.min.z,b.max.z),dx=px-cx,dz=pz-cz,d2=dx*dx+dz*dz;
     if(d2<R*R){
      if(d2>1e-8){const d=Math.sqrt(d2),k=(R-d)/d;px+=dx*k;pz+=dz*k}
      else{const l=px-b.min.x,r=b.max.x-px,f=pz-b.min.z,bk=b.max.z-pz,m=Math.min(l,r,f,bk);
       if(m===l)px=b.min.x-R;else if(m===r)px=b.max.x+R;else if(m===f)pz=b.min.z-R;else pz=b.max.z+R}
     }
    }
   }
   nx=px;nz=pz;ny=py;
   if(ny<-25)respawn('Упал!');
   pl.position.set(nx,ny+foot,nz);
   setState(pa,!on?'jump':mag>.05?'move':'idle',mag);
   // враги
   for(const p of patrols){
    p.t+=dt;const off=Math.sin(p.t*.7)*3,dir=Math.cos(p.t*.7)>=0?1:-1,fx2=Math.sin(p.ry)*off,fz2=Math.cos(p.ry)*off;
    p.r.position.set(p.p0.x+fx2,p.p0.y,p.p0.z+fz2);p.r.rotation.y=p.ry+(dir>0?0:Math.PI);setState(p.a,'move',.5);
    if(!inv){const b=p.b0.clone().translate(new T.Vector3(fx2,0,fz2));if(hit(b,.8))respawn('Тебя поймали!')}
   }
   if(!inv)for(const b of hazards)if(hit(b,.7)){respawn('Ой, опасно!');break}
   // монеты
   for(const c of coins){
    if(c.got)continue;
    if(Math.abs(nx-c.c.x)<R+.6&&Math.abs(nz-c.c.z)<R+.6&&ny<c.top+.4&&ny+H>c.bot-.4){c.got=true;c.r.visible=false;score++;hud();ms_(score===total?'Всё собрано!':'⭐ +1',900)}
   }
   // финиш
   let goalHit=false;for(const b of goals)if(hit(b,1.2))goalHit=true;
   const allDone=score>=total;
   if(goalHit&&!allDone&&!inv){ms_('Сначала собери все ⭐',1200)}
   if((goalHit&&allDone)||(!goals.length&&total&&allDone)){done=true;win.style.display='grid';setState(pa,'idle',0);vx=vz=0}
  }
  // камера
  const hy=ny+H*.8,cp=Math.cos(pitch);
  const tx=nx+Math.sin(yaw)*cp*dist,ty=Math.max(.3,hy+Math.sin(pitch)*dist),tz=nz+Math.cos(yaw)*cp*dist;
  const k=Math.min(1,dt*10);camera.position.x+=(tx-camera.position.x)*k;camera.position.y+=(ty-camera.position.y)*k;camera.position.z+=(tz-camera.position.z)*k;
  camera.lookAt(nx,hy,nz);
 }
 function stop(){
  ui.remove();
  dom.removeEventListener('pointerdown',pd);dom.removeEventListener('pointermove',pm);dom.removeEventListener('pointerup',pu);dom.removeEventListener('pointercancel',pu);
  removeEventListener('keydown',kd);removeEventListener('keyup',ku);
  mixers.forEach(m=>m.stopAllAction());
  coins.forEach(c=>{c.r.visible=c.orig;c.r.position.y=c.y0});
  patrols.forEach(p=>{p.r.position.copy(p.p0);p.r.rotation.y=p.ry});
  pl.position.copy(start);pl.rotation.y=startRy;
 }
 respawn('Играй!');
 return{update,stop,reset};
}

/* ---- готовая игра: страница, которую собирает кнопка «Игра (.html)» ---- */
function boot(meta,b64){
 const T=window.THREE,bin=atob(b64),u=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
 const renderer=new T.WebGLRenderer({antialias:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=!!meta.shadow;
 renderer.domElement.style.cssText='display:block;touch-action:none';document.body.appendChild(renderer.domElement);
 const scene=new T.Scene(),L=meta.light;scene.background=new T.Color(L.bg);
 const hemi=new T.HemisphereLight(L.sky,L.gr,L.hemi);scene.add(hemi);
 const sun=new T.DirectionalLight(L.sun,L.int),a=L.az*Math.PI/180,e=L.el*Math.PI/180;
 sun.position.set(Math.cos(a)*Math.cos(e)*16,Math.sin(e)*16,Math.sin(a)*Math.cos(e)*16);
 sun.castShadow=!!meta.shadow;sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-30,right:30,top:30,bottom:-30,near:1,far:70});sun.shadow.bias=-.0005;scene.add(sun);
 if(meta.ground){const g=new T.Mesh(new T.PlaneGeometry(300,300),new T.MeshStandardMaterial({color:L.gc,roughness:1}));g.rotation.x=-Math.PI/2;g.receiveShadow=true;scene.add(g)}
 const camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.05,500);camera.position.set(0,3,6);
 addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()});
 new T.GLTFLoader().parse(u.buffer,'',gltf=>{
  scene.add(gltf.scene);
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;if(o.isSkinnedMesh)o.frustumCulled=false}});
  const clipsFor=r=>gltf.animations.filter(c=>c.tracks.length&&r.getObjectByName(T.PropertyBinding.parseTrackName(c.tracks[0].name).nodeName));
  const g=create({scene,camera,dom:renderer.domElement,roots:gltf.scene.children.slice(),clips:clipsFor,restartOnly:true});
  if(!g){alert('В игре нет героя');return}
  const ck=new T.Clock();
  (function loop(){requestAnimationFrame(loop);g.update(Math.min(ck.getDelta(),.1));renderer.render(scene,camera)})();
 },()=>alert('Не удалось открыть игру'));
}
async function buildHTML(buf,meta){
 const src=await (await fetch('engine.js')).text();
 const u=new Uint8Array(buf);let s='';
 for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));
 return '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><title>'+String(meta.name||'Игра').replace(/[<>&]/g,'')+'</title><style>html,body{margin:0;height:100%;overflow:hidden;background:#171230}</style></head><body>'
  +'<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js"><\/script>'
  +'<script src="https://cdn.jsdelivr.net/npm/three@0.147.0/examples/js/loaders/GLTFLoader.js"><\/script>'
  +'<script>'+src+'<\/script><script>QWEngine.boot('+JSON.stringify(meta)+',"'+btoa(s)+'")<\/script></body></html>';
}
window.QWEngine={ROLES,create,boot,buildHTML};
})();
