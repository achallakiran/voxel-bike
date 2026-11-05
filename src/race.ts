import {LANES, Track, blend, clamp, type Surface} from './tracks';
export {COURSES, LANES, PIECES, Track, WIDTH, blend, clamp} from './tracks';
export type {Course, Piece} from './tracks';
export const DT=1/120;
export const CRASH_TIME=1.38;
export interface Controls { gas: boolean; turbo: boolean; pitch: number }
export type Mode = 'trial' | 'rival' | 'test';
export type Feedback = 'Clean landing' | 'Rough landing' | 'Wipeout' | 'Loop-out' | 'Overheated' | 'Cooling' | 'Contact' | 'Bump' | 'Lap 2';
export enum CrashKind { None, Back, Front, Side }
export interface Bike {
  x: number; y: number; z: number; vy: number; speed: number; lane: number; pitch: number;
  heat: number; hot: boolean; air: boolean; crash: number; impact: number; spin: number;
  finish: number; recovering: number; wheelie: number; lean: number; side: number;
  crashKind: CrashKind; bumpHit: boolean;
}
export type Frame = [number,number,number,number,number,number,number,CrashKind,number,number];
export interface RecordRun { time: number; frames: Frame[] }
function newBike(x: number, lane: number): Bike {
  return {x,y:0.72,z:LANES[lane],vy:0,speed:0,lane,pitch:0,heat:0,hot:false,air:false,crash:0,
    impact:0,spin:0,finish:0,recovering:0,wheelie:0,lean:0,side:1,crashKind:CrashKind.None,bumpHit:false};
}
const rough = (s:Surface) => s==='mud'||s==='rough'||s==='trap';

export class Race {
  rider: Bike;
  rivals: Bike[];
  time = -2.8;
  tick = 0;
  feedback: Feedback | null = null;
  feedbackTime = 0;
  record: Frame[] = [];
  splits: number[] = [];
  done = false;
  readonly inputs = {gas:false, turbo:false, pitch:0};
  constructor(readonly track: Track, readonly mode: Mode, readonly ghost: RecordRun | undefined) {
    this.rider = newBike(5,2);
    this.rivals = mode==='rival' ? [newBike(6.7,0),newBike(5.6,1),newBike(6.5,3)] : [];
  }
  get position() { return 1+this.rivals.filter(r=>this.rider.finish ?
    r.finish>0&&r.finish<this.rider.finish : r.x>this.rider.x).length; }
  get lap() {return Math.min(this.track.laps,this.splits.length+1);}
  moveLane(dir:number) {
    if(!this.done && !this.rider.crash)this.rider.lane=clamp(this.rider.lane+dir,0,3);
  }
  private signal(event:Feedback) {
    this.feedback=event;
    this.feedbackTime=event==='Overheated'?1.65:event==='Lap 2'?1.3:0.8;
  }
  private fall(b:Bike, kind:CrashKind, player:boolean) {
    b.crash=CRASH_TIME;b.crashKind=kind;b.air=false;b.vy=0;b.wheelie=0;
    b.speed*=kind===CrashKind.Side?0.40:0.33;
    b.impact=1;
    if(player)this.signal(kind===CrashKind.Back?'Loop-out':'Wipeout');
  }
  private contact(a:Bike,b:Bike) {
    if(a.crash||b.crash||a.recovering||b.recovering||a.finish||b.finish)return;
    if(Math.abs(a.x-b.x)>1.52||Math.abs(a.z-b.z)>0.74||Math.abs(a.y-b.y)>0.92)return;
    const trailing=a.x<b.x?a:b, leading=trailing===a?b:a;
    const difference=trailing.speed-leading.speed;
    const sideImpact=Math.abs(a.x-b.x)<0.62&&(Math.abs(a.lean)>0.30||Math.abs(b.lean)>0.30);
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
    const oldX=this.rider.x;
    this.drive(this.rider,this.inputs,dt,true);
    for(const [i,bike] of this.rivals.entries())this.drive(bike,this.rivalInput(bike,i),dt,false);
    const field=[this.rider,...this.rivals];
    for(let i=0;i<field.length;i++)for(let j=i+1;j<field.length;j++)this.contact(field[i],field[j]);
    const marker=this.track.markers[this.splits.length];
    if(this.rider.x>=marker){
      const split=this.time-dt*clamp((this.rider.x-marker)/Math.max(0.01,this.rider.x-oldX),0,1);
      this.splits.push(split);
      if(this.splits.length<this.track.laps)this.signal('Lap 2');
    }
    if(this.tick++%6===0&&this.mode==='trial'){
      const {x,y,z,pitch,spin,crash,crashKind,lean,side}=this.rider;
      this.record.push([this.time,x,y,z,pitch,spin,crash,crashKind,lean,side].map(n=>+n.toFixed(3)) as Frame);
    }
    if(this.rider.finish)this.done=true;
  }
  private rivalInput(b:Bike,i:number):Controls {
    const look=b.x+Math.max(7,b.speed*0.46);
    const launchAhead=this.track.slope(b.x+3,b.z)>0.16;
    const current=this.track.surface(look,LANES[b.lane]);
    if(!b.air&&!launchAhead&&!b.crash&&this.tick%37===i*10){
      const choices=[b.lane,b.lane-1,b.lane+1].filter(l=>l>=0&&l<4);
      const score=(lane:number)=>{
        const surface=this.track.surface(look,LANES[lane]);
        const blocked=[this.rider,...this.rivals].some(o=>o!==b&&o.lane===lane&&o.x>b.x-1&&o.x<b.x+7&&o.speed<b.speed+2);
        return (rough(surface)?-5:surface==='bump'?-1:0)+(surface==='cool'&&b.heat>34?6:0)-(blocked?3:0)
          +(lane===b.lane?0.65:0)+Math.sin((lane+1)*(i+2)+b.x*0.04)*0.53;
      };
      b.lane=choices.reduce((best,lane)=>score(lane)>score(best)?lane:best,b.lane);
    }
    const target=this.track.slope(b.x+Math.max(1,b.speed*0.15),b.z);
    return {gas:true,turbo:!b.hot&&b.heat<74&&!rough(current)&&Math.sin(this.time*(1.48+i*0.16)+i*3)>0.30,
      pitch:b.air?clamp((target-b.pitch)*4.8,-1,1):this.track.surface(b.x+2.9,b.z)==='bump'?0.62:0};
  }
  private drive(b:Bike,input:Controls,dt:number,player:boolean) {
    if(b.finish)return;
    const oldX=b.x;
    b.impact=Math.max(0,b.impact-dt*3.6);
    b.recovering=Math.max(0,b.recovering-dt);
    if(b.crash>0){
      b.crash=Math.max(0,b.crash-dt);
      b.x+=b.speed*dt;b.speed=Math.max(0,b.speed-24*dt);
      b.y=this.track.height(b.x,b.z)+0.72;
      b.heat=Math.max(0,b.heat-23*dt);
      if(!b.crash){b.recovering=0.66;b.pitch=this.track.slope(b.x,b.z);b.lean=0;b.crashKind=CrashKind.None;}
    }else{
      const ground=b.air?'dirt':this.track.surface(b.x,b.z);
      const cooling=ground==='cool', muddy=rough(ground), turbo=input.turbo&&!b.hot, oldHeat=b.heat;
      b.heat=clamp(b.heat+(cooling?-90:turbo?28:b.hot?-49:-18)*dt,0,100);
      if(cooling&&oldHeat>24&&player&&this.feedback!=='Cooling')this.signal('Cooling');
      if(b.heat>=100&&!b.hot){b.hot=true;if(player)this.signal('Overheated');}
      if(b.hot&&b.heat<28)b.hot=false;
      const limit=(b.hot?13:turbo?32:23)*(ground==='mud'?0.61:ground==='rough'?0.69:ground==='trap'?0.66:1);
      if(!b.air){
        const force=b.speed>limit?(muddy?-28:-12):(input.gas||input.turbo)?(b.hot?7:turbo?19:13.8):-8.5;
        b.speed=clamp(b.speed+force*dt,0,33);
      }
      const oldZ=b.z, lateralRate=b.air?1.65:muddy?5.6:10.4;
      const steer=LANES[b.lane]-b.z;
      b.lean=blend(b.lean,clamp(steer*0.49,-0.43,0.43),Math.min(1,dt*13));
      if(b.speed>0.6)b.z+=clamp(steer,-lateralRate*dt,lateralRate*dt);
      b.x+=b.speed*dt;b.spin-=b.speed*dt/0.54;
      const angle=this.track.slope(b.x,b.z);
      if(!b.air){
        const lift=b.speed>5.5&&input.pitch>0.12;
        if(lift){
          const velocity=(input.pitch*1.64-0.33)*(turbo?1.16:1);
          b.wheelie=clamp(b.wheelie+velocity*dt,0,1.25);
        }else b.wheelie=Math.max(0,b.wheelie-(input.pitch<0?3.7:2.8)*dt);
        b.pitch=blend(b.pitch,angle+b.wheelie,Math.min(1,dt*24));
        const wheel=Math.cos(b.pitch)*0.89;
        const rearY=this.track.height(b.x-wheel,b.z)+0.54+Math.sin(b.pitch)*0.89+Math.cos(b.pitch)*0.18;
        const frontY=this.track.height(b.x+wheel,b.z)+0.54-Math.sin(b.pitch)*0.89+Math.cos(b.pitch)*0.18;
        b.y=Math.max(rearY,frontY);
        const bump=this.track.surface(b.x+0.84,b.z)==='bump';
        if(bump&&!b.bumpHit){
          if(b.wheelie<0.20){
            b.speed*=0.75;b.impact=0.78;
            if(player)this.signal('Bump');
          }else b.impact=0.27;
        }
        b.bumpHit=bump;
        const prevSlope=this.track.slope(oldX,oldZ,0.42);
        const nextSlope=this.track.slope(b.x+0.48,b.z,0.42);
        if(b.wheelie>1.10){
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
        const w=Math.cos(b.pitch)*0.89, offset=Math.sin(b.pitch)*0.89;
        const support=Math.max(this.track.height(b.x-w,b.z)+offset,this.track.height(b.x+w,b.z)-offset)
          +0.54+Math.cos(b.pitch)*0.18;
        if(b.y<=support && b.vy<=Math.tan(angle)*b.speed+1.4){
          const error=Math.abs(b.pitch-angle), impact=b.vy-Math.tan(angle)*b.speed;
          b.y=support;b.air=false;b.impact=clamp(0.22+Math.abs(impact)*0.065,0.22,1);
          if(error>0.84&&impact<-3.1)this.fall(b,b.pitch>angle?CrashKind.Back:CrashKind.Front,player);
          else{
            if(error>0.41&&impact<-2.9){b.speed*=0.80;if(player)this.signal('Rough landing');}
            else if(player&&impact<-4.3)this.signal('Clean landing');
            b.pitch=angle;
          }
        }
      }
    }
    if(b.x>=this.track.end)b.finish=this.time-dt*clamp((b.x-this.track.end)/Math.max(0.01,b.x-oldX),0,1);
  }
}
