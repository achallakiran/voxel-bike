import {COURSES, PIECES, DT, Track, Race, clamp, type Course, type Piece, type Mode, type RecordRun} from './race';
import {pieceSpec} from './tracks';
import {View, CAMERA_NAMES, type CameraIndex} from './view';

const el = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
type Screen = 'home'|'select'|'settings'|'builder'|'race'|'pause'|'results'|'rotate'|'error';
type Action = 'up'|'down'|'back'|'forward'|'gas'|'brake'|'turbo';
const screens: Screen[]=['home','select','settings','builder','race','pause','results','rotate','error'];
const keys: Record<string, Action> = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'back',ArrowRight:'forward',KeyZ:'gas',Space:'brake',KeyX:'turbo'};
const prefix='voxel-bikes:v1:';
function load<T>(key:string, fallback:T):T {
  try { return JSON.parse(localStorage.getItem(prefix+key) ?? 'null') ?? fallback; }
  catch { return fallback; }
}
function save(key:string, value:unknown) {
  try {localStorage.setItem(prefix+key,JSON.stringify(value)); return true;}
  catch {return false;}
}
function clock(value:number) {
  const hundredths=Math.floor(Math.max(0,value)*100+1e-7);
  const digits=(n:number)=>String(n).padStart(2,'0');
  return digits(Math.floor(hundredths/6000))+':'+digits(Math.floor(hundredths/100)%60)+'.'+digits(hundredths%100);
}
class Sound {
  enabled=true;
  private lastCrowd=0;
  private duckUntil=0;
  private crowdNoise?:AudioBuffer;
  private ctx?:AudioContext;
  private gain?:GainNode;
  private engine?:OscillatorNode;
  private filter?:BiquadFilterNode;
  unlock(){
    if(!this.enabled)return;
    try{
      if(!this.ctx){
        this.ctx=new AudioContext();
        this.gain=this.ctx.createGain();this.gain.gain.value=0;
        this.filter=this.ctx.createBiquadFilter();this.filter.type='lowpass';
        this.engine=this.ctx.createOscillator();this.engine.type='sawtooth';
        this.engine.connect(this.filter).connect(this.gain).connect(this.ctx.destination);this.engine.start();
      }
      if(this.ctx.state!=='running')void this.ctx.resume().catch(()=>{});
    }catch{ /* Gameplay continues if audio is unavailable. */ }
  }
  resetCrowd(){this.lastCrowd=0;this.duckUntil=0;}
  private crowd(race:Race){
    const reaction=race.crowd, ctx=this.ctx;
    if(!reaction||reaction.serial===this.lastCrowd||!ctx)return;
    this.lastCrowd=reaction.serial;
    if(!this.enabled||ctx.state!=='running'||Math.abs(race.track.delta(reaction.x,race.rider.x))>22)return;
    if(!this.crowdNoise){
      this.crowdNoise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*0.9),ctx.sampleRate);
      const samples=this.crowdNoise.getChannelData(0);
      let filtered=0;
      for(let i=0;i<samples.length;i++){
        filtered=filtered*0.72+(Math.random()*2-1)*0.28;
        samples[i]=filtered;
      }
    }
    const source=ctx.createBufferSource(), band=ctx.createBiquadFilter(), gain=ctx.createGain(), now=ctx.currentTime;
    const cheer=reaction.kind==='cheer';
    this.duckUntil=now+0.63;
    source.buffer=this.crowdNoise;
    band.type='bandpass';band.Q.value=0.85;band.frequency.value=cheer?1190:630;
    band.frequency.exponentialRampToValueAtTime(cheer?1770:365,now+0.45);
    gain.gain.setValueAtTime(0.001,now);
    gain.gain.exponentialRampToValueAtTime(cheer?0.23:0.19,now+0.075);
    gain.gain.exponentialRampToValueAtTime(0.001,now+0.82);
    source.connect(band).connect(gain).connect(ctx.destination);
    source.start();
  }
  update(race:Race|undefined){
    if(!this.ctx||!this.engine||!this.gain||!this.filter)return;
    if(race)this.crowd(race);
    const bike=race?.rider;
    const running=this.enabled&&bike&&!race.done&&race.time>0;
    const now=this.ctx.currentTime;
    const motor=running?(bike.crash?0.014:!race.inputs.brake&&(race.inputs.gas||race.inputs.turbo)?0.055:0.026):0;
    this.gain.gain.setTargetAtTime(motor*(now<this.duckUntil?0.36:1),now,0.05);
    if(!running)return;
    const rev=43+bike.speed*2.9+(bike.air?18:0)+(race.inputs.turbo&&!bike.hot?13:0);
    this.engine.frequency.setTargetAtTime(bike.crash?38:rev,now,0.035);
    this.filter.frequency.setTargetAtTime(bike.hot?180:220+bike.speed*17,now,0.07);
  }
  beep(frequency:number, duration=0.15){
    if(!this.enabled||!this.ctx||this.ctx.state!=='running')return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),now=this.ctx.currentTime;
    o.type='triangle';o.frequency.value=frequency;g.gain.setValueAtTime(0.0001,now);
    g.gain.exponentialRampToValueAtTime(0.16,now+0.014);
    g.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    o.connect(g).connect(this.ctx.destination);o.start();o.stop(now+duration);
  }
}
interface Draft {format:'voxel-bikes-track';version:1;name:string;theme:number;layout:Piece[];loop?:boolean}
const defaultDraft:Draft={format:'voxel-bikes-track',version:1,name:'My Track',theme:0,loop:true,
  layout:['tabletop','cool','rollers','mud','double','straight']};
function validDraft(value:unknown):value is Draft {
  if(!value||typeof value!=='object')return false;
  const d=value as Draft;
  return d.format==='voxel-bikes-track'&&d.version===1&&typeof d.name==='string'&&d.name.length<=36&&
    (d.loop===undefined||typeof d.loop==='boolean')&&Number.isInteger(d.theme)&&d.theme>=0&&d.theme<=4&&Array.isArray(d.layout)&&d.layout.length<=28&&
    d.layout.every(p=>typeof p==='string'&&Object.hasOwn(PIECES,p));
}
let draft=load('draft',defaultDraft);
if(!validDraft(draft))draft=defaultDraft;
let selected=-1;
let screen:Screen='home', mode:Mode='trial', race:Race|undefined;
let course:Course=COURSES[0];
const held=new Map<string,Action>();
const stick=el('joystick'), stickThumb=el('stickThumb');
let stickPointer:number|null=null, stickAxis:'lane'|'pitch'|null=null;
let stickPitch=0, stickLane=0, laneRepeat=0;
const tapButtons=Array.from(document.querySelectorAll<HTMLButtonElement>('[data-action]'));
const coarse=matchMedia('(any-pointer: coarse)');
const portrait=matchMedia('(orientation: portrait)');
const sound=new Sound();
const settings=load<{sound:boolean;quality:boolean;camera?:number}>('settings',{sound:true,quality:true});
let cameraIndex:CameraIndex=0;
const lapSetting=el<HTMLSelectElement>('lapSetting');
const savedLaps=load('raceLaps',3);
let raceLaps=[3,5,7].includes(savedLaps)?savedLaps:3;
lapSetting.value=String(raceLaps);
const nameInput=el<HTMLInputElement>('trackName');
const themeInput=el<HTMLSelectElement>('theme');
const shapeInput=el<HTMLSelectElement>('trackShape');
const fileInput=el<HTMLInputElement>('fileInput');
const runRecords=new Map<string,RecordRun>();
let view:View|undefined;
let countdown='', lastSignal='';
function storedRun(id:string) {
  if(runRecords.has(id))return runRecords.get(id);
  const r=load<RecordRun|null>('best:v5:'+id,null);
  if(r&&Number.isFinite(r.time)&&r.time>0&&r.frames?.length&&r.frames.every(f=>Array.isArray(f)&&f.length===10&&f.every(Number.isFinite))){
    runRecords.set(id,r);return r;
  }
  return undefined;
}
function button(id:string, handler:()=>void) {el(id).addEventListener('click',handler);}
function clearInput(){
  held.clear();
  if(stickPointer!==null){
    const pointer=stickPointer;stickPointer=null;
    if(stick.hasPointerCapture(pointer))stick.releasePointerCapture(pointer);
  }
  resetStick();
  readInput();
}
function show(next:Screen){
  screen=next;clearInput();
  for(const name of screens)el(name).hidden=name!==next;
  const current=el(next);
  if(next!=='race')current.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({preventScroll:true});
  else if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  sound.update(next==='race'?race:undefined);
}
function home(){
  race=undefined;
  show('home');
}
const coursePreviews=COURSES.map(course=>{
  const track=new Track(course);
  const points=Array.from({length:128},(_,i)=>track.pose(i*track.lapLength/128));
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  const zoom=Math.min(84/(maxX-minX),35/(maxZ-minZ));
  const plot=(p:{x:number;z:number})=>[(50+(p.x-(minX+maxX)/2)*zoom).toFixed(1),(23+(p.z-(minZ+maxZ)/2)*zoom).toFixed(1)].join(',');
  const [startX,startY]=plot(points[0]).split(',');
  return {length:track.lapLength,diagram:'<svg class="route-preview" viewBox="0 0 100 46" aria-hidden="true"><polygon points="'+
    points.map(plot).join(' ')+'"/><circle cx="'+startX+'" cy="'+startY+'" r="2.4"/></svg>'};
});
lapSetting.addEventListener('change',()=>{
  raceLaps=Number(lapSetting.value);
  save('raceLaps',raceLaps);
  renderCourses();
});
function choose(next:Mode){
  mode=next;
  renderCourses();
  show('select');
}
function renderCourses(){
  el('modeTitle').textContent=mode==='trial'?'Time Trial':'Rival Race';
  el('courses').replaceChildren(...COURSES.map((c,i)=>{
    const b=document.createElement('button');b.className='course-card';
    b.style.setProperty('--card',['#b42630','#925557','#713538','#c02430','#b48580'][i]);
    const best=mode==='trial'?storedRun(c.id+':'+raceLaps):undefined;
    const preview=coursePreviews[i];
    b.innerHTML='<span class="card-index">0'+(i+1)+' · '+preview.length+' M</span>'+preview.diagram+'<b>'+c.name+'</b><span>'+c.tagline+'</span>'+
      '<small>'+(mode==='trial'?'QUALIFY '+clock(c.gold*raceLaps*1.29):raceLaps+' LAPS')+
      (best?' · BEST '+clock(best.time):'')+'</small>';
    b.addEventListener('click',()=>start(c));return b;
  }));
}
function start(c:Course){
  if(!view)return;
  course=c;
  const track=new Track(course,mode==='test'?1:raceLaps);
  view.reset(track);
  race=new Race(track,mode,mode==='trial'?storedRun(course.id+':'+track.laps):undefined);
  sound.resetCrowd();sound.unlock();
  el('courseLabel').textContent=course.name.toUpperCase();
  el('pauseExit').textContent=mode==='test'?'← Track Builder':'← Main menu';
  el('resultExit').textContent=mode==='test'?'← Track Builder':'← Main menu';
  countdown='';lastSignal='';accumulator=0;
  hud(race);
  show('race');orientation();
}
function endRace(finished:Race){
  el('resultCourse').textContent=course.name+' / '+(mode==='rival'?'Rival Race':mode==='trial'?'Time Trial':'Test Ride');
  el('resultTime').textContent=clock(finished.elapsed);
  let title='Run complete',detail='Course cleared';
  if(mode==='rival'){
    title=['1st place','2nd place','3rd place','4th place'][finished.position-1];
    detail='Position '+finished.position+' / '+(finished.rivals.length+1);
  }
  if(mode==='trial'){
    const time=finished.elapsed, target=course.gold*finished.track.laps;
    const key=course.id+':'+finished.track.laps;
    const best=storedRun(key);
    const medal=time<=target?'Gold':time<=target*1.16?'Silver':time<=target*1.36?'Bronze':'No';
    title=medal==='No'?'Finish':medal+' medal';
    if(!best||time<best.time){
      const run={time,frames:finished.record};
      runRecords.set(key,run);
      const saved=save('best:v5:'+key,run);
      detail=saved?'New personal best · Ghost saved':'New personal best · Ghost available this session';
    }else detail='Personal best '+clock(best.time)+' · +'+(time-best.time).toFixed(2)+' s';
    detail+=' · '+(time<=target*1.29?'Qualified':'Target '+clock(target*1.29));
  }
  const fastest=Math.min(...finished.splits);
  el('lapResults').replaceChildren(...finished.splits.map((lap,i)=>{
    const row=document.createElement('li');
    row.textContent='Lap '+(i+1)+' · '+clock(lap)+(lap===fastest?'  ★':'');
    return row;
  }));
  el('resultTitle').textContent=title;
  el('resultDetail').textContent=detail;
  sound.beep(784,0.36);
  show('results');
}
function setFill(id:string,percent:number){
  const bar=el(id);bar.style.transform='scaleX('+percent/100+')';
  bar.parentElement?.setAttribute('aria-valuenow',String(Math.round(percent)));
}
function hud(r:Race){
  el('timeLabel').textContent=r.mode==='rival'?'P'+r.position+' / '+(r.rivals.length+1):'TIME';
  el('time').textContent=clock(r.elapsed);
  el('lap').textContent=' · LAP '+r.lap+' / '+r.track.laps;
  setFill('progress',clamp((r.rider.x-r.startX)/(r.track.end-r.startX)*100,0,100));
  setFill('heat',r.rider.heat);
  const heatLabel=el('heatLabel'), label=r.rider.hot?'ENGINE CUT':'ENGINE HEAT';
  if(heatLabel.textContent!==label)heatLabel.textContent=label;
  el('heat').closest('.hud-chip')?.classList.toggle('hot',r.rider.hot);
  const message=r.time<0?String(Math.ceil(-r.time)):r.time<0.65?'GO!':'';
  if(message!==countdown){
    countdown=message;
    el('countdown').textContent=countdown;
    if(countdown)sound.beep(countdown==='GO!'?760:410);
  }
  const cue=r.feedbackTime>0?r.feedback:null;
  const feedback=el('feedback');
  feedback.hidden=!cue||!!message;feedback.textContent=cue??'';
  feedback.classList.toggle('danger',cue==='Overheated'||cue==='Wipeout'||cue==='Loop-out'||cue==='Contact'||cue==='Bump crash'||cue==='Dirt trap crash');
  if(cue&&cue!==lastSignal){
    if(cue==='Overheated'||cue==='Wipeout'||cue==='Loop-out'||cue==='Bump crash'||cue==='Dirt trap crash')sound.beep(130,0.28);
    else if(cue==='Rough landing'||cue==='Bump')sound.beep(106,0.10);
    else if(cue==='Clean landing')sound.beep(196,0.09);
    else if(cue.startsWith('Lap '))sound.beep(710,0.22);
    else if(cue==='Cooling')sound.beep(590);
  }
  lastSignal=cue??'';
}
function exitRace(){
  if(mode==='test'){
    race=undefined;showBuilder();
  }else home();
}
function orientation(){
  if(screen==='race'&&coarse.matches&&portrait.matches)show('rotate');
  else if(screen==='rotate'&&(!coarse.matches||!portrait.matches))show('race');
}
portrait.addEventListener('change',orientation);coarse.addEventListener('change',orientation);
function readInput(){
  const active=new Set(held.values());
  if(race){
    race.inputs.gas=active.has('gas');race.inputs.brake=active.has('brake');race.inputs.turbo=active.has('turbo');
    race.inputs.pitch=clamp(stickPitch+Number(active.has('back'))-Number(active.has('forward')),-1,1);
  }
  for(const b of tapButtons)b.classList.toggle('active',active.has(b.dataset.action as Action));
}
function resetStick(){
  stickAxis=null;stickPitch=0;stickLane=0;laneRepeat=0;
  stickThumb.style.transform='';
  stick.classList.remove('active');
}
function steerStick(e:PointerEvent){
  const bounds=stick.getBoundingClientRect(), radius=bounds.width*0.31;
  const x=(e.clientX-bounds.left-bounds.width/2)/radius;
  const y=(e.clientY-bounds.top-bounds.height/2)/radius;
  const length=Math.hypot(x,y), scale=Math.max(1,length);
  stickThumb.style.transform='translate('+x*radius/scale+'px,'+y*radius/scale+'px)';
  if(length<0.12){stickAxis=null;stickPitch=0;stickLane=0;readInput();return;}
  const ax=Math.abs(x),ay=Math.abs(y), bias=0.10;
  if(!stickAxis||ax>ay+bias)stickAxis=ax>=ay?'pitch':'lane';
  else if(ay>ax+bias)stickAxis='lane';
  stickPitch=stickAxis==='pitch'?-Math.sign(x)*Math.sqrt(clamp((ax-0.10)/0.78,0,1)):0;
  const lane=stickAxis==='lane'&&ay>0.23?Math.sign(y):0;
  if(lane!==stickLane&&lane){race?.moveLane(lane);laneRepeat=performance.now()+220;}
  stickLane=lane;
  readInput();
}
stick.addEventListener('pointerdown',e=>{
  if(screen!=='race'||stickPointer!==null||e.button!==0)return;
  e.preventDefault();stickPointer=e.pointerId;
  stick.setPointerCapture(e.pointerId);stick.classList.add('active');sound.unlock();steerStick(e);
});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)steerStick(e);});
function releaseStick(e:PointerEvent){
  if(e.pointerId!==stickPointer)return;
  stickPointer=null;resetStick();readInput();
}
for(const event of ['pointerup','pointercancel','lostpointercapture'] as const)stick.addEventListener(event,releaseStick);
const raceScreen=el('race');
raceScreen.addEventListener('contextmenu',e=>e.preventDefault());
raceScreen.addEventListener('selectstart',e=>e.preventDefault());
raceScreen.addEventListener('touchstart',e=>{
  if(e.target instanceof Element&&e.target.closest('.joystick,.pedals')&&e.cancelable)e.preventDefault();
},{passive:false});
raceScreen.addEventListener('gesturestart',e=>{if(e.cancelable)e.preventDefault();},{passive:false});
raceScreen.addEventListener('wheel',e=>{if(e.ctrlKey&&e.cancelable)e.preventDefault();},{passive:false});
function press(id:string,action:Action){
  if(screen!=='race'||held.has(id))return;
  sound.unlock();
  held.set(id,action);
  if(action==='up')race?.moveLane(-1);
  if(action==='down')race?.moveLane(1);
  readInput();
}
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'){
    if(screen==='race')show('pause');
    else if(screen==='pause'){show('race');orientation();}
    else if(screen==='rotate')exitRace();
    return;
  }
  if(e.code==='KeyC'&&screen==='race'){
    e.preventDefault();
    if(!e.repeat)nextCamera();
    return;
  }
  const action=keys[e.code];
  if(!action||screen!=='race')return;
  e.preventDefault();
  if(!e.repeat)press(e.code,action);
});
window.addEventListener('keyup',e=>{if(held.delete(e.code))readInput();});
window.addEventListener('blur',()=>{if(screen==='race')show('pause');else clearInput();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&screen==='race')show('pause');});
for(const b of tapButtons){
  b.addEventListener('pointerdown',e=>{
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    press('touch:'+e.pointerId,b.dataset.action as Action);
  });
  const release=(e:PointerEvent)=>{if(held.delete('touch:'+e.pointerId))readInput();};
  b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
}
function renderDraft(scroll=false){
  const layout=el('layout');
  layout.replaceChildren(...draft.layout.map((piece,i)=>{
    const b=document.createElement('button');
    b.textContent=(i+1)+' · '+(pieceSpec(piece).code??pieceSpec(piece).icon)+' '+pieceSpec(piece).name;
    b.setAttribute('aria-pressed',String(i===selected));
    b.addEventListener('click',()=>{selected=i;renderDraft();(layout.children[i] as HTMLButtonElement | undefined)?.focus({preventScroll:true});});
    return b;
  }));
  if(scroll&&selected>=0)layout.children[selected]?.scrollIntoView({block:'nearest',inline:'nearest'});
  el('layoutInfo').textContent=draft.layout.length+' / 28 pieces';
  el<HTMLButtonElement>('earlier').disabled=selected<=0;
  el<HTMLButtonElement>('later').disabled=selected<0||selected===draft.layout.length-1;
  el<HTMLButtonElement>('remove').disabled=selected<0;
  el<HTMLButtonElement>('testTrack').disabled=draft.layout.length===0;
  for(const b of el('palette').querySelectorAll('button'))b.disabled=draft.layout.length>=28;
}
function commitDraft(message='',scroll=false){
  const saved=save('draft',draft);
  el('builderStatus').textContent=message||(!saved?'Draft available this session. Export to keep a copy.':'');
  renderDraft(scroll);
}
function showBuilder(){
  nameInput.value=draft.name;
  themeInput.value=String(draft.theme);
  shapeInput.value=draft.loop?'loop':'straight';
  renderDraft();show('builder');
}
for(const piece of Object.keys(PIECES) as Piece[]){
  const detail=pieceSpec(piece);
  const b=document.createElement('button');
  b.innerHTML='<span class="piece-icon">'+(detail.code??detail.icon)+'</span>'+detail.name;
  b.addEventListener('click',()=>{
    if(draft.layout.length>=28)return;
    selected=draft.layout.length;
    draft={...draft,layout:[...draft.layout,piece as Piece]};commitDraft('',true);
  });
  el('palette').append(b);
}
nameInput.addEventListener('input',()=>{draft={...draft,name:nameInput.value};commitDraft();});
themeInput.addEventListener('change',()=>{draft={...draft,theme:Number(themeInput.value)};commitDraft();});
shapeInput.addEventListener('change',()=>{draft={...draft,loop:shapeInput.value==='loop'};commitDraft();});
function movePiece(dir:number){
  const dest=selected+dir;
  if(selected<0||dest<0||dest>=draft.layout.length)return;
  const layout=[...draft.layout];
  [layout[selected],layout[dest]]=[layout[dest],layout[selected]];
  draft={...draft,layout};selected=dest;commitDraft('',true);
}
button('earlier',()=>movePiece(-1));button('later',()=>movePiece(1));
button('remove',()=>{
  if(selected<0)return;
  draft={...draft,layout:draft.layout.filter((_,i)=>i!==selected)};
  selected=Math.min(selected,draft.layout.length-1);commitDraft();
});
button('testTrack',()=>{
  if(!draft.layout.length)return;
  mode='test';
  start({id:'custom',name:draft.name.trim()||'My Track',theme:draft.theme,tagline:'',gold:0,loop:draft.loop,layout:[...draft.layout]});
});
button('export',()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(draft,null,2)],{type:'application/json'}));
  const a=document.createElement('a');
  a.href=url;a.download=(draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'voxel-bikes-track')+'.json';
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
button('import',()=>fileInput.click());
fileInput.addEventListener('change',async()=>{
  const file=fileInput.files?.[0];fileInput.value='';
  if(!file)return;
  try{
    if(file.size>64*1024)throw new Error('File too large');
    const incoming:unknown=JSON.parse(await file.text());
    if(!validDraft(incoming))throw new Error('Invalid course');
    draft=incoming;selected=-1;showBuilder();commitDraft('Track imported.');
  }catch{el('builderStatus').textContent='Could not import this Voxel Bikes track.';}
});
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.addEventListener('click',()=>choose(b.dataset.mode as Mode));
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-home]'))b.addEventListener('click',home);
button('builderButton',showBuilder);
button('settingsButton',()=>show('settings'));
button('offline',()=>{
  const a=document.createElement('a');a.href='./Voxel-Bikes-Offline.html';a.download='Voxel-Bikes-Offline.html';
  document.body.append(a);a.click();a.remove();
});
if(location.protocol==='file:')el('offline').hidden=true;
button('cameraButton',nextCamera);
button('pauseButton',()=>show('pause'));
button('resume',()=>{sound.unlock();show('race');orientation();});
button('restart',()=>start(course));button('retry',()=>start(course));
button('pauseExit',exitRace);button('resultExit',exitRace);button('rotateExit',exitRace);
button('reload',()=>location.reload());
const soundToggle=el<HTMLInputElement>('sound'), qualityToggle=el<HTMLInputElement>('quality');
const cameraSetting=el<HTMLSelectElement>('cameraSetting');
function setCamera(index:number){
  cameraIndex=(Number.isInteger(index)&&index>=0&&index<CAMERA_NAMES.length?index:0) as CameraIndex;
  cameraSetting.value=String(cameraIndex);
  el('cameraButton').setAttribute('aria-label','Change camera · '+CAMERA_NAMES[cameraIndex]);
  if(view)view.cameraIndex=cameraIndex;
}
function nextCamera(){setCamera((cameraIndex+1)%CAMERA_NAMES.length);syncSettings();}
setCamera(settings.camera??0);
soundToggle.checked=settings.sound;qualityToggle.checked=settings.quality;sound.enabled=settings.sound;
function syncSettings(){
  sound.enabled=soundToggle.checked;
  if(view)view.quality=qualityToggle.checked;
  save('settings',{sound:sound.enabled,quality:qualityToggle.checked,camera:cameraIndex});
}
soundToggle.addEventListener('change',()=>{syncSettings();sound.unlock();});
qualityToggle.addEventListener('change',syncSettings);
cameraSetting.addEventListener('change',()=>{setCamera(Number(cameraSetting.value));syncSettings();});
let last=performance.now(), accumulator=0;
function loop(now:number){
  const dt=clamp((now-last)/1000,0,0.12);last=now;
  if(screen==='race'&&race){
    if(stickLane&&now>=laneRepeat){race.moveLane(stickLane);laneRepeat=now+175;}
    accumulator+=dt;
    while(accumulator>=DT){race.step(DT);accumulator-=DT;}
    hud(race);
    sound.update(race);
    if(race.done)endRace(race);
  }
  if(screen!=='error')view?.frame(dt,race,race?.done?1:clamp(accumulator/DT,0,1));
  requestAnimationFrame(loop);
}
try{
  const canvas=el<HTMLCanvasElement>('world');
  view=new View(canvas);
  view.quality=settings.quality;
  view.cameraIndex=cameraIndex;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  view.reduceMotion=motion.matches;
  motion.addEventListener('change',e=>{if(view)view.reduceMotion=e.matches;});
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();
    el('errorMessage').textContent='The graphics context was interrupted. Reload to return to the starting gate.';
    show('error');
  });
  requestAnimationFrame(loop);
}catch(error){console.error(error);show('error');}
