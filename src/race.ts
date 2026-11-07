import {LANES, Track, blend, clamp, type Surface} from './tracks';
import {DEFAULT_CONDITIONS, conditionBonus, wetness, type Conditions} from './conditions';
import {BASE_LOADOUT, DIFFICULTIES, bikeStats, raceColors, rivalLoadouts, type Difficulty, type Loadout} from './bikes';
export {COURSES, LANES, PIECES, Track, WIDTH, blend, clamp} from './tracks';
export type {Course, Piece} from './tracks';
export const DT=1/120;
export const CRASH_TIME=2.85;
// Keep crash samples compatible with ghosts recorded before the longer recovery.
export const RECORDED_CRASH_TIME=1.38;
export interface Controls { gas: boolean; brake: boolean; turbo: boolean; pitch: number }
export type Mode = 'trial' | 'rival' | 'practice';
export type Feedback = 'Clean landing' | 'Rough landing' | 'Wipeout' | 'Loop-out' | 'Overheated' | 'Cooling' | 'Contact' | 'Bump' | 'Bump crash' | 'Dirt trap crash' | `Lap ${number}`;
export type CrowdKind = 'gasp' | 'landing' | 'pass' | 'lap' | 'finish';
export interface CrowdEvent {kind:CrowdKind; x:number; serial:number; time:number}
export enum CrashKind { None, Back, Front, Side }
export interface Bike {
  x: number; y: number; z: number; vy: number; speed: number; lane: number; pitch: number;
  heat: number; hot: boolean; heatLock:number; air: boolean; crash: number; impact: number; spin: number;
  finish: number; recovering: number; wheelie: number; lean: number; side: number;
  crashKind: CrashKind; hazard:Surface;
}
export type Frame = [number,number,number,number,number,number,number,CrashKind,number,number];
export interface RecordRun { time: number; frames: Frame[]; loadout?:Loadout }
function newBike(x: number, lane: number): Bike {
  return {x,y:0.72,z:LANES[lane],vy:0,speed:0,lane,pitch:0,heat:0,hot:false,heatLock:0,air:false,crash:0,
    impact:0,spin:0,finish:0,recovering:0,wheelie:0,lean:0,side:1,crashKind:CrashKind.None,hazard:'dirt'};
}

const rough = (s:Surface) => s==='mud'||s==='rough'||s==='trap';

export class Race {
  rider: Bike;
  rivals: Bike[];
  readonly previous:Bike[];
  readonly startX:number;
  time = -2.8;
  tick = 0;
  readonly id=globalThis.crypto?.randomUUID?.()??Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  points=0;
  practiceLaps=0;
  practiceBest=0;
  wrapSerial=0;
  private wheelieDistance=0;
  private wheelieLastX=0;
  private bestPassX=-Infinity;
  private pointAt=new Map<string,number>();
  readonly loadout:Loadout;
  readonly colors:number[];
  readonly opponentLoadouts:Loadout[];
  private readonly opponentStats:ReturnType<typeof bikeStats>[];
  private readonly playerStats:ReturnType<typeof bikeStats>;
  feedback: Feedback | null = null;
  feedbackTime = 0;
  record: Frame[] = [];
  splits: number[] = [];
  private gateTime:number|null;
  private lastGateTime=0;
  get elapsed(){return this.gateTime===null?0:Math.max(0,(this.rider.finish||this.time)-this.gateTime);}
  done = false;
  readonly crowd:CrowdEvent[]=[];
  private readonly reactionAt=new Map<CrowdKind,number>();
  private readonly passedRivals=new Set<Bike>();
  private crowdSerial=0;
  readonly inputs = {gas:false, brake:false, turbo:false, pitch:0};
  constructor(readonly track: Track, readonly mode: Mode, readonly ghost: RecordRun | undefined, readonly conditions:Conditions=DEFAULT_CONDITIONS, readonly difficulty:Difficulty='easy',loadout:Loadout=BASE_LOADOUT) {
    this.loadout=structuredClone(loadout);this.colors=raceColors(this.loadout);this.playerStats=bikeStats(this.loadout);
    this.opponentLoadouts=rivalLoadouts(difficulty);this.opponentStats=this.opponentLoadouts.map(bikeStats);
    this.startX=track.circuit?-6:5;
    this.gateTime=track.circuit?null:0;
    this.rider = newBike(this.startX,2);
    this.rivals = mode==='rival' ? [newBike(this.startX+1.7,0),newBike(this.startX+0.6,1),newBike(this.startX+1.5,3)] : [];
    const field=[this.rider,...this.rivals];
    for(const b of field)b.y=track.height(b.x,b.z)+0.72;
    this.previous=field.map(b=>({...b}));
  }
  get position() { return 1+this.rivals.filter(r=>this.rider.finish ?
    r.finish>0&&r.finish<this.rider.finish : r.x>this.rider.x).length; }
  get finishOrder(){
    return [this.rider,...this.rivals].map((bike,index)=>({index,time:bike.finish}))
      .filter(entry=>entry.time>0).sort((a,b)=>a.time-b.time||a.index-b.index);
  }
  get lap() {return this.mode==='practice'?this.practiceLaps+1:Math.min(this.track.laps,this.splits.length+1);}
  get lapTime(){return this.gateTime===null?0:Math.max(0,this.time-this.lastGateTime);}
  private score(kind:string,amount:number,cooldown:number){
    if(this.time-(this.pointAt.get(kind)??-Infinity)<cooldown)return;
    this.pointAt.set(kind,this.time);this.points+=Math.round(amount*(this.mode==='practice'?1:1+conditionBonus(this.conditions)));
  }
  moveLane(dir:number) {
    if(!this.done && !this.rider.crash)this.rider.lane=clamp(this.rider.lane+dir,0,3);
  }
  private signal(event:Feedback) {
    this.feedback=event;
    this.feedbackTime=event==='Overheated'?2.3:event.startsWith('Lap ')?1.3:0.8;
  }
  private react(kind:CrowdKind,x:number){
    const cooldown=kind==='pass'?2.2:kind==='landing'||kind==='gasp'?0.85:0;
    if(this.time-(this.reactionAt.get(kind)??-Infinity)<cooldown)return;
    this.reactionAt.set(kind,this.time);
    this.crowd.push({kind,x,serial:++this.crowdSerial,time:this.time});
    if(this.crowd.length>12)this.crowd.shift();
  }
  private fall(b:Bike, kind:CrashKind, player:boolean) {
    b.crash=CRASH_TIME;b.crashKind=kind;b.air=false;b.vy=0;b.wheelie=0;
    b.speed*=kind===CrashKind.Side?0.40:0.33;
    b.impact=1;
    if(player||Math.abs(this.track.delta(b.x,this.rider.x))<20)this.react('gasp',b.x);
    if(player){this.wheelieDistance=0;this.wheelieLastX=b.x;}
    if(player)this.signal(kind===CrashKind.Back?'Loop-out':'Wipeout');
  }
  private contact(a:Bike,b:Bike) {
    if(a.crash||b.crash||a.recovering||b.recovering||a.finish||b.finish)return;
    const gap=this.track.delta(a.x,b.x);
    if(Math.abs(gap)>1.52||Math.abs(a.z-b.z)>0.74||Math.abs(a.y-b.y)>0.92)return;
    const trailing=gap<0?a:b, leading=trailing===a?b:a;
    const difference=trailing.speed-leading.speed;
    const sideImpact=Math.abs(gap)<0.62&&(Math.abs(a.lean)>0.30||Math.abs(b.lean)>0.30);
    if(difference>5.1||sideImpact){
      const victim=sideImpact?(Math.abs(a.lean)>Math.abs(b.lean)?a:b):trailing;
      const other=victim===a?b:a;
      victim.side=Math.sign(victim.z-other.z)||1;
      this.fall(victim,sideImpact?CrashKind.Side:CrashKind.Front,victim===this.rider);
      other.recovering=0.38;
    }else{
      trailing.speed*=0.80;trailing.impact=0.65;
      if(trailing===this.rider)this.signal('Contact');
      a.recovering=b.recovering=0.58;
    }
  }
  step(dt:number) {
    if(this.done)return;
    this.time+=dt;
    this.feedbackTime=Math.max(0,this.feedbackTime-dt);
    if(this.time<0)return;
    const oldX=this.rider.x, alreadyFinished=!!this.rider.finish;
    const field=[this.rider,...this.rivals];
    field.forEach((b,i)=>Object.assign(this.previous[i],b));
    this.drive(this.rider,this.inputs,dt,true);
    for(const [i,bike] of this.rivals.entries())this.drive(bike,this.rivalInput(bike,i),dt,false);
    for(let i=0;i<field.length;i++)for(let j=i+1;j<field.length;j++)this.contact(field[i],field[j]);
    if(this.mode==='rival'&&!alreadyFinished){
      for(const rival of this.rivals){
        if(rival.finish)continue;
        const gap=this.rider.x-rival.x;
        if(gap<-2)this.passedRivals.delete(rival);
        if(gap>1.8&&gap<7&&oldX-this.previous[this.rivals.indexOf(rival)+1].x<=1.8&&!this.passedRivals.has(rival)){
          this.passedRivals.add(rival);this.react('pass',this.rider.x);
          if(this.rider.x>this.bestPassX+12){this.score('pass',30,2);this.bestPassX=this.rider.x;}
        }
      }
    }
    const marker=this.mode==='practice'?this.track.lapLength:this.track.markers[this.splits.length];
    const crossedAt=(x:number)=>this.time-dt*clamp((this.rider.x-x)/Math.max(0.01,this.rider.x-oldX),0,1);
    if(this.gateTime===null&&this.rider.x>=0){
      this.gateTime=this.lastGateTime=crossedAt(0);
    }
    if(this.gateTime!==null&&this.rider.x>=marker&&(this.mode==='practice'||this.splits.length+1<this.track.laps||!this.rider.crash)){
      const crossing=oldX>=marker?this.time:crossedAt(marker);
      const split=crossing-this.lastGateTime;
      this.lastGateTime=crossing;
      if(this.mode==='practice'){
        this.practiceLaps++;
        this.practiceBest=this.practiceBest?Math.min(this.practiceBest,split):split;
        this.rider.x-=this.track.lapLength;
        this.previous[0].x-=this.track.lapLength;
        this.wheelieLastX-=this.track.lapLength;
        this.wrapSerial++;
      }else{
        this.splits.push(split);
        if(this.splits.length===this.track.laps-1)this.react('lap',marker);
        if(this.splits.length<this.track.laps)this.signal(`Lap ${this.lap}`);
      }
    }
    if(!this.rider.crash&&!this.rider.air&&this.rider.wheelie>0.28&&this.rider.wheelie<0.95){
      this.wheelieDistance+=Math.max(0,this.rider.x-this.wheelieLastX);
      if(this.wheelieDistance>=8){this.score('wheelie',10,1);this.wheelieDistance=0;}
    }else this.wheelieDistance=0;
    this.wheelieLastX=this.rider.x;
    if(this.tick++%6===0&&this.mode==='trial'&&!alreadyFinished){
      const {x,y,z,pitch,spin,crash,crashKind,lean,side}=this.rider;
      this.record.push([this.time,x,y,z,pitch,spin,crash*RECORDED_CRASH_TIME/CRASH_TIME,crashKind,lean,side].map(n=>+n.toFixed(3)) as Frame);
    }
    if(this.rider.finish){
      if(!alreadyFinished)this.react('finish',this.track.end);
      this.done=this.mode!=='rival'||this.time-this.rider.finish>=10||
        (this.time-this.rider.finish>=1.15&&this.finishOrder.length>=3);
    }
  }
  private rivalInput(b:Bike,i:number):Controls {
    const ability=DIFFICULTIES[this.difficulty];
    const look=b.x+Math.max(5,b.speed*(this.difficulty==='easy'?0.30:0.46));
    const launchAhead=this.track.slope(b.x+3,b.z)>0.16;
    const current=this.track.surface(look,LANES[b.lane]);
    if(!b.air&&!launchAhead&&!b.crash&&this.tick%ability.decision===i*10){
      const choices=[b.lane,b.lane-1,b.lane+1].filter(l=>l>=0&&l<4);
      const score=(lane:number)=>{
        const surface=this.track.surface(look,LANES[lane]);
        const blocked=[this.rider,...this.rivals].some(o=>o!==b&&o.lane===lane&&this.track.delta(o.x,b.x)>-1&&this.track.delta(o.x,b.x)<7&&o.speed<b.speed+2);
        const corner=this.track.pose(look).curvature;
        const route=Math.sign(corner)*LANES[lane]*(this.track.course.theme===0?0.22:-0.15)*clamp(Math.abs(corner)*44,0,1);
        return (rough(surface)?-5:surface==='bump'?-1:0)+(surface==='cool'&&b.heat>34?6:0)-(blocked?3:0)
           +route+(lane===b.lane?0.65:0)+Math.sin((lane+1)*(i+2)+b.x*0.04)*0.53;
      };
      b.lane=choices.reduce((best,lane)=>score(lane)>score(best)?lane:best,b.lane);
    }
    const target=this.track.slope(b.x+Math.max(1,b.speed*0.15),b.z);
    const cornerAhead=Math.abs(this.track.pose(look+6).curvature);
    return {gas:true,brake:false,turbo:!b.hot&&b.heat<74&&!rough(current)&&cornerAhead<0.035&&Math.sin(this.time*(1.48+i*0.16)+i*3)>ability.turbo,
      pitch:b.air?clamp((target-b.pitch)*ability.aim,-1,1):
        [2,4,6,8].some(d=>this.track.surface(b.x+d,b.z)==='bump')?0.88:0};
  }
  private updateHeat(b:Bike,turbo:boolean,cooling:boolean,dt:number,player:boolean){
    const oldHeat=b.heat;
    const factor=this.statsFor(b).cooling;
    const rate=b.hot?(cooling?-60:-15)*factor:cooling?-90*factor:turbo?28/factor:-18*factor;
    b.heat=clamp(b.heat+rate*dt,0,100);
    if(b.hot){
      b.heatLock=Math.max(0,b.heatLock-dt);
      if(!b.heatLock&&b.heat<=32)b.hot=false;
    }else if(b.heat>=100){
      b.hot=true;b.heatLock=3.2;
      if(player)this.signal('Overheated');
    }else if(cooling&&oldHeat>24&&player&&this.feedback!=='Cooling'){
      this.signal('Cooling');
    }
  }
  private statsFor(b:Bike){return b===this.rider?this.playerStats:this.opponentStats[this.rivals.indexOf(b)]??this.playerStats;}
  private drive(b:Bike,input:Controls,dt:number,player:boolean) {
    if(b.finish)return;
    const stats=this.statsFor(b);
    const pace=player?1:DIFFICULTIES[this.difficulty].pace;
    const oldX=b.x, curve=this.track.pose(b.x).curvature;
    const laneRatio=clamp(1-curve*b.z,0.68,1.32);
    b.impact=Math.max(0,b.impact-dt*3.6);
    b.recovering=Math.max(0,b.recovering-dt);
    if(b.crash>0){
      b.crash=Math.max(0,b.crash-dt);
      b.x+=b.speed*dt/laneRatio;b.speed=Math.max(0,b.speed-24*dt);
      b.y=this.track.height(b.x,b.z)+0.72;
      this.updateHeat(b,false,false,dt,player);
      if(!b.crash){b.recovering=0.66;b.pitch=this.track.slope(b.x,b.z);b.lean=0;b.crashKind=CrashKind.None;}
    }else{
      const ground=b.air?'dirt':this.track.surface(b.x,b.z);
      const cooling=ground==='cool', muddy=rough(ground);
      const turbo=input.turbo&&!input.brake&&!b.hot;
      this.updateHeat(b,turbo,cooling,dt,player);
      const wet=b.air?0:wetness(this.track,this.conditions,b.x,b.z,ground);
      const grip=[23,16,13,18,15][this.track.course.theme]*(muddy?0.62:1)*(1-wet*0.26*stats.wetControl)*stats.grip;
      const turnLimit=Math.sqrt(grip*laneRatio/Math.max(0.001,Math.abs(curve)));
      const surfaceLimit=(turbo?32:23)*stats.speed*pace*(ground==='mud'?0.61:ground==='rough'?0.69:ground==='trap'?0.66:1)*(1-wet*(muddy?0.15:0.03));
      const limit=Math.min(surfaceLimit,turnLimit);
      if(!b.air){
        const force=input.brake?-44*stats.braking*(1-wet*0.36):b.hot?-34:b.speed>limit?(muddy?-28:-12):(input.gas||input.turbo)?(turbo?19:13.8)*stats.acceleration*pace:-8.5;
        b.speed=clamp(b.speed+force*dt,0,33*stats.speed);
      }else if(input.brake)b.speed=Math.max(0,b.speed-4.5*dt);
      const oldZ=b.z, lateralRate=(b.air?1.65:(muddy?5.6:10.4)*(1-wet*0.33*stats.wetControl))*stats.agility;
      const steer=LANES[b.lane]-b.z;
      b.lean=blend(b.lean,clamp(steer*0.49-curve*b.speed*0.43,-0.43,0.43),Math.min(1,dt*13));
      if(b.speed>0.6)b.z+=clamp(steer,-lateralRate*dt,lateralRate*dt);
      b.x+=b.speed*dt/laneRatio;b.spin-=b.speed*dt/0.54;
      const angle=this.track.slope(b.x,b.z);
      if(!b.air){
        const lift=b.speed>2.8&&input.pitch>0.10&&!input.brake;
        if(lift){
          const rise=b.wheelie<0.30?2.90:1.54;
          b.wheelie=Math.min(1.25,b.wheelie+(0.32+input.pitch*rise)*stats.lift*(turbo?1.10:1)*dt);
        }else b.wheelie=Math.max(0,b.wheelie-(input.pitch<0||input.brake?4.8:3.6)*dt);
        b.pitch=blend(b.pitch,angle+b.wheelie,1-Math.exp(-dt*33));
        const sine=Math.sin(b.pitch), cosine=Math.cos(b.pitch);
        const frontX=b.x+cosine*stats.wheelbase+sine*0.18,rearX=b.x-cosine*stats.wheelbase+sine*0.18;
        const rearY=this.track.height(rearX,b.z)+0.54+sine*stats.wheelbase+cosine*0.18;
        const frontY=this.track.height(frontX,b.z)+0.54-sine*stats.wheelbase+cosine*0.18;
        b.y=Math.max(rearY,frontY);
        const frontSurface=this.track.surface(frontX,b.z);
        const bump=frontSurface==='bump';
        const barrierTop=this.track.height(frontX+0.45,b.z);
        const frontBottom=rearY+sine*stats.wheelbase-cosine*0.18-0.54;
        if(frontSurface!==b.hazard){
          if(bump&&frontBottom<barrierTop+0.035){
            if(b.speed>=21.5){
              this.fall(b,CrashKind.Front,player);
              if(player)this.signal('Bump crash');
            }else if(b.speed>=11){
              b.speed*=0.74;b.impact=0.86;
              if(player)this.signal('Bump');
            }
          }else if(frontSurface==='trap'&&b.speed>=27&&b.wheelie<0.17){
            this.fall(b,CrashKind.Front,player);
            if(player)this.signal('Dirt trap crash');
          }else if(bump){b.impact=0.27;if(player&&b.wheelie>0.17){this.score('obstacle',35,1.5);this.react('landing',b.x);}}
        }
        b.hazard=frontSurface;
        const prevSlope=this.track.slope(oldX,oldZ,0.42);
        const nextSlope=this.track.slope(b.x+0.48,b.z,0.42);
        if(b.crash){
          b.y=Math.max(b.y,this.track.height(b.x,b.z)+0.72);
        }else if(b.wheelie>1.10){
          this.fall(b,CrashKind.Back,player);
        }else if(!bump&&prevSlope>0.16&&prevSlope-nextSlope>0.14&&b.speed>8.5){
          b.air=true;b.vy=Math.min(11.4,Math.tan(prevSlope)*b.speed*0.84+Math.max(0,input.pitch)*0.58);
          b.wheelie=0;b.y+=0.026;
        }else if(Math.abs(b.z-oldZ)>0.008&&Math.abs(this.track.height(b.x,b.z)-this.track.height(b.x,oldZ))>0.09){
          b.speed=Math.max(0,b.speed-7*dt);
        }
      }else{
        b.vy-=20.5*dt;b.y+=b.vy*dt;
        const assist=this.track.slope(b.x+b.speed*0.12,b.z)*0.38;
        b.pitch=clamp(b.pitch+(input.pitch*2.13+(assist-b.pitch)*1.28)*dt,-1.40,1.40);
        const w=Math.cos(b.pitch)*stats.wheelbase, offset=Math.sin(b.pitch)*stats.wheelbase;
        const support=Math.max(this.track.height(b.x-w,b.z)+offset,this.track.height(b.x+w,b.z)-offset)
          +0.54+Math.cos(b.pitch)*0.18;
        if(b.y<=support && b.vy<=Math.tan(angle)*b.speed+1.4){
          const error=Math.abs(b.pitch-angle), impact=b.vy-Math.tan(angle)*b.speed;
          b.y=support;b.air=false;b.impact=clamp((0.22+Math.abs(impact)*0.065)/stats.suspension,0.16,1);
          if(error>Math.min(0.82,0.70+(stats.suspension-1)*0.12)&&impact<-3.1)this.fall(b,b.pitch>angle?CrashKind.Back:CrashKind.Front,player);
          else{
            if(error>0.35&&impact<-2.9){b.speed*=Math.min(0.91,0.80+(stats.suspension-1)*0.20);if(player)this.signal('Rough landing');}
            else if(impact<-4.3){
              if(player&&error<0.23)this.score('landing',50,1.2);
              if(error<0.23&&(player||Math.abs(this.track.delta(b.x,this.rider.x))<18))this.react('landing',b.x);
              if(player)this.signal('Clean landing');
            }
            b.pitch=angle;
          }
        }
      }
    }
    if(this.mode!=='practice'&&b.x>=this.track.end&&!b.crash)b.finish=oldX>=this.track.end?this.time:this.time-dt*clamp((b.x-this.track.end)/Math.max(0.01,b.x-oldX),0,1);
  }
}
