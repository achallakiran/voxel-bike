import {playStudioLogo} from './studio-logo';
import {COURSES, DT, Track, Race, clamp, type Course, type Mode, type RecordRun} from './race';
import {conditionKey, type Conditions} from './conditions';
import {View, CAMERA_NAMES, type CameraIndex} from './view';

const el = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
type Screen = 'intro'|'home'|'select'|'settings'|'race'|'pause'|'results'|'rotate'|'error';
type Action = 'up'|'down'|'back'|'forward'|'gas'|'brake'|'turbo';
const screens: Screen[]=['intro','home','select','settings','race','pause','results','rotate','error'];
const keys: Record<string, Action> = {ArrowUp:'up',ArrowDown:'down',ArrowLeft:'back',ArrowRight:'forward',KeyZ:'gas',Space:'brake',KeyX:'turbo'};
const rearKeys: Record<string,Action> = {ArrowUp:'forward',ArrowDown:'back',ArrowLeft:'up',ArrowRight:'down'};
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
  private lastThunder=-1;
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
  resetCrowd(){this.lastCrowd=0;this.duckUntil=0;this.lastThunder=-1;}
  private crowd(race:Race){
    const latest=race.crowd.at(-1), ctx=this.ctx;
    if(!latest||latest.serial<=this.lastCrowd||!ctx)return;
    const reaction=race.crowd.filter(event=>event.serial>this.lastCrowd&&Math.abs(race.track.delta(event.x,race.rider.x))<36).at(-1);
    this.lastCrowd=latest.serial;
    if(!reaction||!this.enabled||ctx.state!=='running'||ctx.currentTime<this.duckUntil&&reaction.kind!=='finish')return;
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
    const cheer=reaction.kind!=='gasp';
    const big=reaction.kind==='lap'||reaction.kind==='finish';
    this.duckUntil=now+0.63;
    source.buffer=this.crowdNoise;
    band.type='bandpass';band.Q.value=0.85;band.frequency.value=cheer?1190:630;
    band.frequency.exponentialRampToValueAtTime(cheer?1770:365,now+0.45);
    gain.gain.setValueAtTime(0.001,now);
    gain.gain.exponentialRampToValueAtTime(big?0.32:cheer?0.23:0.19,now+0.075);
    gain.gain.exponentialRampToValueAtTime(0.001,now+0.82);
    source.connect(band).connect(gain).connect(ctx.destination);
    source.start();
  }
  update(race:Race|undefined){
    if(!this.ctx||!this.engine||!this.gain||!this.filter)return;
    if(race){
      this.crowd(race);
      const stormTime=race.time-18.85;
      const flash=Math.floor(stormTime/20);
      if(race.conditions.weather==='Thunderstorm'&&flash>this.lastThunder&&stormTime>=0&&!race.done){
        this.lastThunder=flash;
        this.thunder();
      }
    }
    const bike=race?.rider;
    const running=this.enabled&&bike&&!bike.finish&&!race.done&&race.time>0;
    const now=this.ctx.currentTime;
    const motor=running?(bike.crash?0.014:!race.inputs.brake&&(race.inputs.gas||race.inputs.turbo)?0.055:0.026):0;
    this.gain.gain.setTargetAtTime(motor*(now<this.duckUntil?0.36:1),now,0.05);
    if(!running)return;
    const rev=43+bike.speed*2.9+(bike.air?18:0)+(race.inputs.turbo&&!bike.hot?13:0);
    this.engine.frequency.setTargetAtTime(bike.crash?38:rev,now,0.035);
    this.filter.frequency.setTargetAtTime(bike.hot?180:220+bike.speed*17,now,0.07);
  }
  private thunder(){
    const ctx=this.ctx;
    if(!this.enabled||!ctx||ctx.state!=='running')return;
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*1.1),ctx.sampleRate);
    const samples=buffer.getChannelData(0);
    let roll=0;
    for(let i=0;i<samples.length;i++){
      roll=roll*0.988+(Math.random()*2-1)*0.012;
      samples[i]=roll;
    }
    const source=ctx.createBufferSource(), gain=ctx.createGain(), now=ctx.currentTime;
    source.buffer=buffer;
    gain.gain.setValueAtTime(0.001,now);
    gain.gain.exponentialRampToValueAtTime(0.52,now+0.12);
    gain.gain.exponentialRampToValueAtTime(0.001,now+1.1);
    source.connect(gain).connect(ctx.destination);
    source.start();
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
let screen:Screen='intro', mode:Mode='trial', race:Race|undefined;
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
let rotationReturn:Screen='intro';
const forwardView=()=>cameraIndex===2||cameraIndex===4;
const lapSetting=el<HTMLSelectElement>('lapSetting');
const daylightSetting=el<HTMLSelectElement>('daylightSetting'), weatherSetting=el<HTMLSelectElement>('weatherSetting');
function selectedConditions():Conditions{
  return {light:daylightSetting.value as Conditions['light'],weather:weatherSetting.value as Conditions['weather']};
}
function recordKey(courseId:string,laps:number,conditions:Conditions){
  return courseId+':'+laps+conditionKey(conditions);
}
const histories=new Map<string,number[]>();
function pastTimes(key:string,best:number|undefined){
  if(histories.has(key))return histories.get(key)!;
  const raw=load<unknown>('podium:v1:'+key,null);
  return Array.isArray(raw)?raw.filter(t=>typeof t==='number'&&Number.isFinite(t)&&t>0).sort((a,b)=>a-b).slice(0,2)
    :best===undefined?[]:[best];
}
const savedLaps=load('raceLaps',3);
let raceLaps=[3,5,7].includes(savedLaps)?savedLaps:3;
lapSetting.value=String(raceLaps);
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
  if(next!=='rotate'&&next!=='error'&&coarse.matches&&portrait.matches){
    rotationReturn=next;
    next='rotate';
  }
  screen=next;
  el('rotateExit').hidden=!race;clearInput();
  for(const name of screens)el(name).hidden=name!==next;
  if(next==='intro')startStudioCard();
  const current=el(next);
  if(next!=='race'&&next!=='intro')current.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({preventScroll:true});
  else if(document.activeElement instanceof HTMLElement)document.activeElement.blur();
  sound.update(next==='race'?race:undefined);
}
let studioTimer:number|undefined;
let studioStarted=false;
function startStudioCard(){
  if(studioStarted)return;
  studioStarted=true;
  const first='> ADA STUDIOS',second='  PRESENTS';
  const firstLine=el('studioFirst'),secondLine=el('studioSecond'),cursor=el('studioCursor');
  let count=0;
  const type=()=>{
    count++;
    firstLine.textContent=first.slice(0,count);
    if(count>first.length+3){
      secondLine.textContent=second.slice(0,count-first.length-3);
      secondLine.after(cursor);
    }
    if(count>=first.length+3+second.length)window.clearInterval(studioTimer);
  };
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){
    count=first.length+3+second.length-1;
    type();
  }else studioTimer=window.setInterval(type,85);
}
const studioContinue=el<HTMLButtonElement>('studioContinue');
button('studioContinue',()=>{
  if(screen!=='intro'||studioContinue.hidden)return;
  window.clearInterval(studioTimer);
  studioContinue.hidden=true;
  void playStudioLogo(el('intro'),home,sound.enabled);
});
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
for(const control of [daylightSetting,weatherSetting])control.addEventListener('change',renderCourses);
function renderCourses(){
  el('modeTitle').textContent=mode==='trial'?'Time Trial':'Rival Race';
  el('courses').replaceChildren(...COURSES.map((c,i)=>{
    const b=document.createElement('button');b.className='course-card';
    b.style.setProperty('--card',['#b42630','#925557','#713538','#c02430','#b48580'][i]);
    const best=mode==='trial'?storedRun(recordKey(c.id,raceLaps,selectedConditions())):undefined;
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
  const track=new Track(course,raceLaps);
  const conditions=selectedConditions();
  view.reset(track,conditions);
  race=new Race(track,mode,mode==='trial'?storedRun(recordKey(course.id,track.laps,conditions)):undefined,conditions);
  sound.resetCrowd();sound.unlock();
  el('courseLabel').textContent=course.name.toUpperCase();
  countdown='';lastSignal='';accumulator=0;
  el('race').classList.remove('finish-shot');
  hud(race);
  show('race');
}
type PodiumEntry={label:string; time:number; current:boolean; color:string};
const riderColors=['#d32a3c','#56bcb6','#ffc35d','#8c91e8'];
function showPodium(entries:PodiumEntry[]){
  const winner=entries[0]?.time??0;
  el('podium').replaceChildren(...[1,0,2].map(index=>{
    const entry=entries[index];
    const step=document.createElement('div');
    step.className='podium-step rank-'+(index+1);
    step.style.setProperty('--rider-color',entry?.color??'#999');
    if(entry){
      const rider=document.createElement('div');
      rider.className='podium-rider';
      rider.setAttribute('aria-hidden','true');
      const label=document.createElement('b');
      label.textContent=entry.label;
      const time=document.createElement('small');
      time.textContent=clock(entry.time)+(index?' · +'+(entry.time-winner).toFixed(2)+' s':'');
      step.append(rider,label,time);
      if(entry.current)step.classList.add('current');
    }
    const place=document.createElement('strong');
    place.className='podium-rank';
    place.textContent=String(index+1);
    step.append(place);
    return step;
  }));
  el('podium').hidden=!entries.length;
}
function endRace(finished:Race){
  el('resultCourse').textContent=course.name+' / '+(mode==='rival'?'Rival Race':'Time Trial');
  el('resultTime').textContent=clock(finished.elapsed);
  let title='Run complete',detail='Course cleared';
  let podium:PodiumEntry[]=[];
  if(mode==='rival'){
    title=['1st place','2nd place','3rd place','4th place'][finished.position-1];
    detail='Position '+finished.position+' / '+(finished.rivals.length+1);
    const origin=finished.rider.finish-finished.elapsed;
    podium=finished.finishOrder.slice(0,3).map(({index,time})=>({
      label:index?'Rival '+index:'You',time:time-origin,current:index===0,color:riderColors[index]
    }));
  }
  if(mode==='trial'){
    const time=finished.elapsed, target=course.gold*finished.track.laps;
    const key=recordKey(course.id,finished.track.laps,finished.conditions);
    const best=storedRun(key);
    podium=[{label:'This run',time,current:true,color:riderColors[0]},
      ...pastTimes(key,best?.time).map((previous,index)=>({
        label:index?'Previous run':'Previous best',time:previous,current:false,color:'#698ea0'
      }))].sort((a,b)=>a.time-b.time);
    const history=podium.slice(0,2).map(entry=>entry.time);
    histories.set(key,history);
    save('podium:v1:'+key,history);
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
    const label=document.createElement('span'), time=document.createElement('time');
    label.textContent='Lap '+(i+1)+(lap===fastest?' ★':'');
    time.textContent=clock(lap);
    row.append(label,time);
    return row;
  }));
  showPodium(podium);
  if(podium.length&&!podium.some(entry=>entry.current))el('resultDetail').classList.add('outside-podium');
  else el('resultDetail').classList.remove('outside-podium');
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
  if(cue&&cue!==lastSignal){
    if(cue==='Overheated'||cue==='Wipeout'||cue==='Loop-out'||cue==='Bump crash'||cue==='Dirt trap crash')sound.beep(130,0.28);
    else if(cue==='Rough landing'||cue==='Bump')sound.beep(106,0.10);
    else if(cue==='Clean landing')sound.beep(196,0.09);
    else if(cue.startsWith('Lap '))sound.beep(710,0.22);
    else if(cue==='Cooling')sound.beep(590);
  }
  lastSignal=cue??'';
}
function orientation(){
  if(screen==='rotate'){
    if(!coarse.matches||!portrait.matches)show(rotationReturn);
  }else if(screen!=='error'&&coarse.matches&&portrait.matches)show(screen);
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
  const pitch=forwardView()?y:-x, lateral=forwardView()?x:y;
  const ax=Math.abs(pitch),ay=Math.abs(lateral), bias=0.10;
  if(!stickAxis||ax>ay+bias)stickAxis=ax>=ay?'pitch':'lane';
  else if(ay>ax+bias)stickAxis='lane';
  stickPitch=stickAxis==='pitch'?Math.sign(pitch)*Math.sqrt(clamp((ax-0.10)/0.78,0,1)):0;
  const lane=stickAxis==='lane'&&ay>0.23?Math.sign(lateral):0;
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
  if(screen!=='race'||race?.rider.finish||held.has(id))return;
  sound.unlock();
  held.set(id,action);
  if(action==='up')race?.moveLane(-1);
  if(action==='down')race?.moveLane(1);
  readInput();
}
window.addEventListener('keydown',e=>{
  if(screen==='intro'&&(e.code==='Enter'||e.code==='Space')){
    e.preventDefault();
    if(!e.repeat)el('studioContinue').click();
    return;
  }
  if(e.code==='Escape'){
    if(screen==='race')show('pause');
    else if(screen==='pause'){show('race');}
    else if(screen==='rotate'&&race)home();
    return;
  }
  if(e.code==='KeyC'&&screen==='race'){
    e.preventDefault();
    if(!e.repeat)nextCamera();
    return;
  }
  const action=(forwardView()?rearKeys[e.code]:undefined)??keys[e.code];
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
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]'))b.addEventListener('click',()=>choose(b.dataset.mode as Mode));
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-home]'))b.addEventListener('click',home);
button('settingsButton',()=>show('settings'));
button('offline',()=>{
  const a=document.createElement('a');a.href='./Voxel-Bikes-Offline.html';a.download='Voxel-Bikes-Offline.html';
  document.body.append(a);a.click();a.remove();
});
if(location.protocol==='file:')el('offline').hidden=true;
button('cameraButton',nextCamera);
button('pauseButton',()=>show('pause'));
button('resume',()=>{sound.unlock();show('race');});
button('restart',()=>start(course));button('retry',()=>start(course));
button('nextTrack',()=>{
  const next=(COURSES.findIndex(c=>c.id===course.id)+1)%COURSES.length;
  start(COURSES[next]);
});
button('pauseExit',home);button('resultExit',home);button('rotateExit',home);
button('reload',()=>location.reload());
const soundToggle=el<HTMLInputElement>('sound'), qualityToggle=el<HTMLInputElement>('quality');
const cameraSetting=el<HTMLSelectElement>('cameraSetting');
function setCamera(index:number){
  clearInput();
  cameraIndex=(Number.isInteger(index)&&index>=0&&index<CAMERA_NAMES.length?index:0) as CameraIndex;
  cameraSetting.value=String(cameraIndex);
  el('cameraButton').setAttribute('aria-label','Change camera · '+CAMERA_NAMES[cameraIndex]);
  el('touchHelp').textContent=(forwardView()
    ? 'Move left or right to change lanes. Pull down to lift the nose or push up to lower it.'
    : 'Move up or down to change lanes. Pull left to lift the nose or push right to lower it.')
    +' The gauge is throttle and the bolt is turbo. Release both to coast.';
  el('laneKeys').textContent=forwardView()?'← / →':'↑ / ↓';
  el('pitchKeys').textContent=forwardView()?'↓ / ↑':'← / →';
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
    else if(race.rider.finish&&!el('race').classList.contains('finish-shot')){el('race').classList.add('finish-shot');clearInput();}
  }
  if(screen!=='error'&&screen!=='intro'&&!(screen==='rotate'&&rotationReturn==='intro'))view?.frame(dt,race,race?.done?1:clamp(accumulator/DT,0,1));
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
  show('intro');
  requestAnimationFrame(loop);
}catch(error){console.error(error);show('error');}
