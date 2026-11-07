import {bikeStats, BASE_LOADOUT, type BikeId} from './bikes';
import * as T from 'three';
import {DEFAULT_CONDITIONS, wetness, type Conditions} from './conditions';
import {RaceEffects} from './race-effects';
import {RiderVisibility} from './visibility';
import { LANES, WIDTH, Track, Race, Bike, blend, clamp, DT, CRASH_TIME, RECORDED_CRASH_TIME, CrashKind, type CrowdKind } from './race';
const PALETTES = [
  { sky:0x79c1c6, fog:0x9fcbd0, dirt:0xb97449, soil:0x875139, grass:0x646f47, rock:0xa78b65, far:0x749995, trim:0xf3ddd2, sun:0xffdd9d },
  { sky:0x9eaac8, fog:0xb0a9c1, dirt:0x9d704e, soil:0x63525b, grass:0x6d6578, rock:0x8a7886, far:0x7b7e9c, trim:0xebc8b9, sun:0xffba83 },
  { sky:0x385676, fog:0x55718a, dirt:0x856854, soil:0x564d52, grass:0x4d6258, rock:0x657b80, far:0x466581, trim:0xecc8bc, sun:0xbdd9e5 },
  { sky:0xcb9c87, fog:0xc79784, dirt:0x996052, soil:0x703d39, grass:0x655450, rock:0x9a6960, far:0x925d5b, trim:0xffe5cf, sun:0xffbb88 },
  { sky:0xa0bed7, fog:0xc1c9ce, dirt:0xb48e73, soil:0x8d6d5b, grass:0x88877f, rock:0xd1c5b7, far:0xb1a7a7, trim:0xffeee0, sun:0xffdbb0 },
];
const cube = new T.BoxGeometry(1,1,1);
const tyre = new T.CylinderGeometry(0.54,0.54,0.33,12).rotateX(Math.PI/2);
const depthStops=[-WIDTH/2,-3.6,-2.4,-1.2,-0.58,-0.22,0,0.22,0.58,1.2,2.4,3.6,WIDTH/2];
const rim = new T.CylinderGeometry(0.34,0.34,0.36,10).rotateX(Math.PI/2);
const circle = new T.CircleGeometry(1,18).rotateX(-Math.PI/2);
const materials = new Map<string,T.MeshStandardMaterial>();
function mat(color: number, ghost: boolean) {
  const key = color + ':' + ghost;
  if (!materials.has(key)) materials.set(key,new T.MeshStandardMaterial({color, roughness:0.87,
    transparent:ghost, opacity:ghost ? 0.29 : 1, depthWrite:!ghost}));
  return materials.get(key)!;
}
function box(parent: T.Object3D, color:number, x:number,y:number,z:number,w:number,h:number,d:number,ghost=false) {
  const m = new T.Mesh(cube,mat(color,ghost));
  m.position.set(x,y,z); m.scale.set(w,h,d); parent.add(m); return m;
}
function bar(parent:T.Object3D, color:number, ax:number,ay:number,bx:number,by:number,z:number,thick:number,depth:number,ghost=false) {
  const m = box(parent,color,(ax+bx)/2,(ay+by)/2,z,Math.hypot(bx-ax,by-ay),thick,depth,ghost);
  m.rotation.z = Math.atan2(by-ay,bx-ax); return m;
}
interface RiderLimbs {
  thigh:T.Mesh; shin:T.Mesh; boot:T.Mesh; upperArm:T.Mesh; forearm:T.Mesh;
}
interface RiderView {
  root:T.Group; body:T.Group; person:T.Group; wheels:T.Group[]; steering:T.Group; gloves:T.Group; limbs:RiderLimbs[]; shadow:T.Mesh<T.CircleGeometry,T.MeshBasicMaterial>; fork:T.Mesh;
}
function makeRider(scene:T.Scene,color:number,ghost=false,design:BikeId='starter'):RiderView {
  const root=new T.Group(),body=new T.Group(),person=new T.Group();
  scene.add(root); root.add(body); body.add(person);
  const ink=0x18242b, silver=0xb2bbc1, white=0xf9f0d4;
  const b=(c:number,x:number,y:number,z:number,w:number,h:number,d:number) => box(body,c,x,y,z,w,h,d,ghost);
  const p=(c:number,x:number,y:number,z:number,w:number,h:number,d:number) => box(person,c,x,y,z,w,h,d,ghost);
  b(ink,-0.25,0.45,0,1.24,0.2,0.56); // seat
  b(color,-0.90,0.35,0,0.86,0.16,0.58).rotation.z=0.18;
  b(color,0.30,0.47,0,0.59,0.36,0.63);
  b(silver,-0.06,-0.04,0,0.7,0.39,0.56);
  b(ink,-0.04,-0.27,0,0.57,0.14,0.57);
  b(silver,-0.82,0.12,0.31,0.79,0.14,0.13).rotation.z=-0.12;
  b(color,0.98,0.30,0,0.89,0.14,0.49).rotation.z=-0.13;
  b(white,0.64,0.53,0,0.16,0.4,0.60).rotation.z=0.25;
  bar(body,silver,-0.94,-0.2,0.14,-0.11,0.18,0.12,0.12,ghost);
  const fork=bar(body,silver,0.89,-0.23,0.50,0.65,0,0.14,0.47,ghost);
  const steering=new T.Group(),gloves=new T.Group();
  steering.position.set(0.48,0.80,0);body.add(steering);steering.add(gloves);
  const handle=(c:number,x:number,y:number,z:number,w:number,h:number,d:number)=>box(steering,c,x,y,z,w,h,d,ghost);
  handle(silver,-0.02,0.02,0,0.13,0.12,0.70);
  for(const side of [-1,1]){
    handle(silver,-0.045,0.08,side*0.43,0.13,0.12,0.22).rotation.x=side*0.25;
    handle(ink,-0.11,0.12,side*0.66,0.18,0.15,0.30);
    handle(silver,0.045,0.14,side*0.66,0.045,0.04,0.28);
    box(gloves,white,-0.14,0.16,side*0.64,0.23,0.16,0.20,ghost);
    box(gloves,color,-0.32,0.15,side*0.56,0.25,0.19,0.18,ghost).rotation.y=side*0.34;
    b(silver,0.78,0.10,side*0.22,0.09,0.63,0.10).rotation.z=0.36;
    bar(body,silver,-0.91,-0.18,-0.26,-0.08,side*0.21,0.11,0.09,ghost);
    b(ink,-0.21,-0.02,side*0.36,0.35,0.10,0.17);
  }
  handle(ink,-0.01,0.16,0,0.20,0.12,0.32);
  handle(white,-0.01,0.225,0,0.14,0.025,0.22);
  b(ink,0.15,0.68,0,0.18,0.07,0.18); // fuel cap
  for(let i=0;i<4;i++)b(ink,0.01,0.055+i*0.065,0,0.48,0.025,0.58); // engine fins
  b(ink,-1.12,0.20,0.31,0.08,0.13,0.13); // exhaust mouth
  b(silver,-0.58,0.08,0,0.15,0.40,0.18).rotation.z=-0.32;
  if(design==='swift'){
    b(color,-0.65,0.55,0,0.65,0.09,0.50);
    b(white,0.98,0.39,0,0.60,0.06,0.44);
  }else if(design==='redline'){
    b(color,0.33,0.59,0,0.66,0.19,0.67);
    for(const side of [-1,1])b(ink,0.42,0.48,side*0.345,0.35,0.16,0.035);
    b(silver,-0.79,0.21,0.35,0.72,0.18,0.16);
  }
  const limbs=[-0.33,0.33].map(z=>({
    thigh:bar(person,ink,-0.38,0.70,0.13,0.46,z,0.25,0.23,ghost),
    shin:bar(person,ink,0.13,0.46,-0.17,0.12,z,0.23,0.23,ghost),
    boot:p(ink,-0.04,0.09,z,0.32,0.19,0.27),
    upperArm:bar(person,color,-0.11,1.19,0.14,0.91,z,0.20,0.22,ghost),
    forearm:bar(person,white,0.14,0.91,0.51,0.72,z,0.16,0.20,ghost),
  }));
  p(color,-0.27,0.93,0,0.54,0.59,0.54).rotation.z=-0.38;
  p(white,-0.35,1.11,0,0.34,0.18,0.58).rotation.z=-0.38;
  p(color,0.03,1.46,0,0.56,0.52,0.55);
  p(color,0.12,1.73,0,0.35,0.09,0.47);
  p(ink,0.30,1.49,0,0.20,0.18,0.56);
  p(white,0.38,1.61,0,0.23,0.07,0.55);
  p(color,0.24,1.31,0,0.32,0.13,0.46);
  p(white,-0.04,1.737,0,0.14,0.07,0.57);
  p(white,-0.12,1.47,0,0.09,0.37,0.57);
  for(const z of [-0.306,0.306]){
    b(white,-0.51,0.29,z,0.48,0.29,0.035);
    for(const [x,y,w,h] of [[-0.59,0.30,0.034,0.145],[-0.52,0.30,0.034,0.145],[-0.555,0.375,0.10,0.029],
      [-0.555,0.225,0.10,0.029],[-0.43,0.375,0.105,0.029],[-0.414,0.308,0.035,0.15]]){
      b(ink,x,y,z*1.08,w,h,0.016);
    }
  }
  b(white,0.47,0.48,0,0.07,0.19,0.65);
  const wheels=[-0.91,0.89].map(x=>{
    const wheel=new T.Group(); wheel.position.set(x,-0.18,0); body.add(wheel);
    wheel.add(new T.Mesh(tyre,mat(ink,ghost)),new T.Mesh(rim,mat(silver,ghost)));
    for (const z of [-0.19,0.19]) {
      box(wheel,ink,0,0,z,0.61,0.06,0.033,ghost);
      box(wheel,ink,0,0,z,0.06,0.61,0.033,ghost);
      box(wheel,white,0,0,z*1.1,0.13,0.13,0.04,ghost);
    }
    return wheel;
  });
  const shadow=new T.Mesh(circle,new T.MeshBasicMaterial({color:0x231b25,transparent:true,opacity:ghost?0:0.24,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  shadow.scale.set(1.44,1,0.58); scene.add(shadow);
  return {root,body,person,wheels,steering,gloves,limbs,shadow,fork};
}
type Block = [number,number,number,number,number,number,number];
const decorationMaterial = new T.MeshStandardMaterial({roughness:0.92});
function batch(scene:T.Object3D,blocks:Block[],track?:Track) {
  if (!blocks.length) return;
  const mesh=new T.InstancedMesh(cube,decorationMaterial,blocks.length);
  const obj=new T.Object3D(), color=new T.Color();
  blocks.forEach(([x,y,z,w,h,d,c],i)=>{
    const p=track?.pose(x,z);
    obj.position.set(p?.x??x,y,p?.z??z);
    obj.rotation.y=p?-Math.atan2(p.fz,p.fx):0;
    obj.scale.set(w,h,d);obj.updateMatrix();
    mesh.setMatrixAt(i,obj.matrix);mesh.setColorAt(i,color.setHex(c));
  });
  mesh.computeBoundingSphere(); scene.add(mesh);return mesh;
}
const neutral=new T.Quaternion();
const contactPoint=new T.Vector3(), worldCorrection=new T.Vector3();
function crashGround(track:Track,bike:Bike,point:T.Vector3){
  let distance=bike.x;
  for(let i=0;i<3;i++){
    const p=track.pose(distance);
    distance=clamp(distance+(point.x-p.x)*p.fx+(point.z-p.z)*p.fz,bike.x-5,bike.x+5);
  }
  const p=track.pose(distance);
  const lane=clamp(-(point.x-p.x)*p.fz+(point.z-p.z)*p.fx,-WIDTH/2,WIDTH/2);
  return track.height(distance,lane);
}
function clearance(track:Track,bike:Bike,parts:T.Object3D[]){
  let lift=0;
  for(const part of parts){
    if(!(part instanceof T.Mesh))continue;
    if(part.geometry===tyre){
      for(let i=0;i<12;i++)for(const side of [-0.165,0.165]){
        const angle=i*Math.PI/6;
        contactPoint.set(Math.cos(angle)*0.54,Math.sin(angle)*0.54,side).applyMatrix4(part.matrixWorld);
        lift=Math.max(lift,crashGround(track,bike,contactPoint)-contactPoint.y+0.035);
      }
    }else if(part.geometry===cube){
      for(const x of [-0.5,0.5])for(const y of [-0.5,0.5])for(const z of [-0.5,0.5]){
        contactPoint.set(x,y,z).applyMatrix4(part.matrixWorld);
        lift=Math.max(lift,crashGround(track,bike,contactPoint)-contactPoint.y+0.05);
      }
    }
  }
  return lift;
}
function limbSegment(part:T.Mesh,ax:number,ay:number,bx:number,by:number){
  part.position.x=(ax+bx)/2;
  part.position.y=(ay+by)/2;
  part.rotation.z=Math.atan2(by-ay,bx-ax);
  part.scale.x=Math.hypot(bx-ax,by-ay);
}
function poseLegsAndArms(view:RiderView,standing:number,stride=0,phase=0){
  view.limbs.forEach(({thigh,shin,boot,upperArm,forearm},i)=>{
    const cycle=phase+i*Math.PI;
    const reach=Math.sin(cycle)*stride,step=Math.max(0,Math.cos(cycle))*stride;
    const kneeX=blend(0.13,-0.23+reach*0.19,standing), kneeY=blend(0.46,0.36+step*0.10,standing);
    const footX=blend(-0.17,-0.37+reach*0.40,standing), footY=blend(0.12,-0.02+step*0.28,standing);
    const elbowX=blend(0.14,-0.28-reach*0.25,standing), elbowY=blend(0.91,0.88,standing);
    limbSegment(thigh,-0.38,0.70,kneeX,kneeY);
    limbSegment(shin,kneeX,kneeY,footX,footY);
    boot.position.x=footX+0.13;
    boot.position.y=footY-0.03;
    limbSegment(upperArm,-0.11,1.19,elbowX,elbowY);
    limbSegment(forearm,elbowX,elbowY,blend(0.51,-0.02-reach*0.30,standing),blend(0.72,0.83+Math.abs(reach)*0.14,standing));
  });
}
const crashOffset=new T.Vector3(), crashPose=new T.Quaternion(), bodyInverse=new T.Quaternion();
const crashAngles=new T.Euler(0,0,0,'YXZ');
function animateCrash(view:RiderView,track:Track,bike:Bike,ground:number){
  const age=CRASH_TIME-bike.crash;
  const ease=(start:number,end:number)=>T.MathUtils.smoothstep(age,start,end);
  const tumble=clamp(age/0.86,0,1);
  const separate=ease(0,0.18);
  const back=bike.crashKind===CrashKind.Back, side=bike.crashKind===CrashKind.Side;
  const direction=back?-1:1;
  const fall=ease(0,0.48), rightBike=ease(2.49,2.77), mount=ease(2.64,CRASH_TIME);
  const bank=-Math.atan(track.bank(track.pose(bike.x).curvature));
  const slope=track.slope(bike.x,bike.z);
  view.root.position.y=blend(bike.y,ground+0.72,ease(0,0.32));
  view.body.rotation.x=bank+bike.side*1.42*fall*(1-rightBike);
  view.body.rotation.z=blend(bike.pitch+(side?0.14:-direction*1.20)*fall,slope,ease(0.18,0.74));
  view.root.updateMatrixWorld(true);
  const bikeParts=view.body.children.filter(p=>p!==view.person);
  for(const wheel of view.wheels)bikeParts.push(wheel.children[0]);
  for(const part of view.steering.children)if(part instanceof T.Mesh)bikeParts.push(part);
  view.root.position.y+=clearance(track,bike,bikeParts)*(1-rightBike);
  view.root.updateMatrixWorld(true);

  // Roll to a stop, push up, run back to the bike, then swing onto the seat.
  const run=clamp((age-1.39)/1.10,0,1);
  const runTravel=run*run*(3-2*run);
  const travel=ease(0.04,0.88)*(1-runTravel);
  const riderX=direction*(side?2.15:3.25);
  const riderZ=bike.side*(side?1.86:1.26);
  const standing=ease(1.02,1.39)*(1-mount);
  const stride=ease(1.39,1.51)*(1-ease(2.31,2.49));
  const phase=(age-1.39)*Math.PI*8.5;
  const rollAngle=age<0.86?Math.PI*2.5*ease(0.06,0.86):Math.PI/2*(1-ease(1.02,1.39));
  const rollArc=Math.sin(tumble*Math.PI)*0.52;
  const runBob=Math.abs(Math.sin(phase))*stride*0.08;
  const onGround=blend(0.13,0.03,standing)+rollArc+runBob;
  const offsetX=riderX*travel,offsetZ=riderZ*travel+bike.side*0.57*(ease(1.38,2.49)-mount);
  const underRider=track.height(bike.x+offsetX,clamp(bike.z+offsetZ,-WIDTH/2,WIDTH/2));
  const riderHeight=blend(view.root.position.y,underRider+onGround,separate);
  crashOffset.set(offsetX,riderHeight-view.root.position.y+Math.sin(mount*Math.PI)*0.52,offsetZ);
  bodyInverse.copy(view.body.quaternion).invert();
  view.person.position.copy(crashOffset.multiplyScalar(1-mount).applyQuaternion(bodyInverse));
  const heading=Math.atan2(riderZ,-riderX)*ease(1.10,1.39)*(1-mount);
  crashAngles.set(bike.side*0.34*fall*(1-standing),heading,-direction*rollAngle);
  crashPose.setFromEuler(crashAngles);
  view.person.quaternion.copy(neutral).slerp(crashPose.premultiply(bodyInverse),separate*(1-mount));
  poseLegsAndArms(view,standing,stride,phase);
  view.root.updateMatrixWorld(true);
  const lift=clearance(track,bike,view.person.children);
  worldCorrection.set(0,lift,0).applyQuaternion(view.body.getWorldQuaternion(crashPose).invert());
  view.person.position.addScaledVector(worldCorrection,1-mount);
}
function seeded(seed:number) {return () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export const CAMERA_NAMES = ['Hero side','Broadcast','Rear chase','Front quarter','First person'] as const;
export type CameraIndex = 0 | 1 | 2 | 3 | 4;

class TitleTrack {
  readonly scene=new T.Scene();
  readonly camera=new T.PerspectiveCamera(37,1,0.15,115);
  private readonly rider=makeRider(this.scene,0xd32a3c);
  private readonly sections:T.Group[]=[];
  private readonly arms:{mesh:T.InstancedMesh; x:number;y:number;z:number;side:number;phase:number}[][]=[];
  private readonly marker=new T.Object3D();
  private distance=0;
  private time=0;
  constructor(){
    this.scene.background=new T.Color(0xa5d1d5);
    this.scene.fog=new T.Fog(0xafcbd0,23,68);
    this.scene.add(new T.HemisphereLight(0xffecd0,0x9b7781,2.1));
    const sun=new T.DirectionalLight(0xffead3,2.15);sun.position.set(-9,15,9);this.scene.add(sun);
    const ground=box(this.scene,0x716c56,0,-0.68,0,220,0.8,86);
    ground.material.roughness=1;
    const colors=[0xcf263d,0xffe5d5,0x376d78,0xe09b62,0x954c5e,0x234a5e];
    const rng=seeded(727);
    for(let section=0;section<8;section++){
      const group=new T.Group();this.scene.add(group);this.sections.push(group);
      const blocks:Block[]=[];
      const put=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>blocks.push([x,y,z,w,h,d,c]);
      for(let i=0;i<8;i++){
        const x=i*2-7;
        put(x,-0.16,0,2,0.32,9.7,i%2?0xaa7153:0xb17858);
        put(x,0.034,4.65,1.98,0.067,0.30,i%2?0xb42336:0xffedda);
        put(x,0.034,-4.65,1.98,0.067,0.30,i%2?0xb42336:0xffedda);
        for(let j=0;j<3;j++)put(x+rng()*1.65-0.85,0.015,(rng()-0.5)*8,0.16+rng()*0.38,0.029,0.10+rng()*0.08,0x8b5945);
      }
      for(let i=0;i<5;i++)put(i*3.3-7.5,0.41,-6.2,0.11,1.25,0.13,0x49282f);
      put(0,0.58,-6.2,16,0.12,0.15,0xf8ddcc);
      put(0,0.28,-6.2,16,0.07,0.11,0xa82939);
      const wave:{x:number;y:number;z:number;side:number;phase:number;color:number}[]=[];
      for(let row=0;row<4;row++){
        const y=0.64+row*0.62,z=-8.5-row*0.94;
        put(0,y-0.38,z,16,0.48+row*0.32,0.96,row%2?0xa56357:0xcc8c76);
        for(let j=0;j<15;j++){
          if(rng()<0.11)continue;
          const x=-7.6+j*1.05+rng()*0.24, shirt=colors[Math.floor(rng()*colors.length)];
          put(x,y,z,0.39,0.46,0.36,shirt);
          put(x,y+0.38,z,0.27,0.27,0.27,rng()<0.45?0xbc8467:0xe4a987);
          if(rng()<0.62)put(x,y+0.53,z,0.29,0.075,0.30,shirt);
          if((j+row)%2===0){
            const phase=rng()*6.28;
            for(const side of [-1,1])wave.push({x:x+side*0.23,y:y+0.12,z,side,phase,color:shirt});
          }
        }
      }
      if(section%2===0){
        put(0,3.30,-8.1,0.12,6.7,0.14,0x542d34);
        for(let j=0;j<6;j++)put(0.28+j*0.32,6.26-j*0.045,-8.1,0.33,0.88-j*0.072,0.12,j%2?0xeeb7aa:0xbe2234);
      }
      for(let layer=0;layer<3;layer++){
        put(rng()*2-1,0.6+layer*1.65,-27-layer*1.8,16+rng()*2-layer,4.1,7,layer%2?0x78958f:0x879e96);
      }
      batch(group,blocks);
      const mesh=new T.InstancedMesh(cube,decorationMaterial,wave.length);
      mesh.frustumCulled=false;
      const color=new T.Color();
      wave.forEach((arm,index)=>mesh.setColorAt(index,color.setHex(arm.color)));
      group.add(mesh);
      this.arms.push(wave.map(({color:_,...arm})=>({mesh,...arm})));
    }
  }
  frame(renderer:T.WebGLRenderer,dt:number,aspect:number,moving:boolean){
    if(moving){this.distance=(this.distance+dt*16.8)%128;this.time+=dt;}
    this.sections.forEach((section,i)=>{
      section.position.x=((i*16-this.distance+192)%128)-64;
      const arms=this.arms[i];
      if(!arms.length)return;
      arms[0].mesh.visible=Math.abs(section.position.x)<48;
      if(!arms[0].mesh.visible)return;
      arms.forEach((arm,j)=>{
        const sway=Math.sin(this.time*5.3+arm.phase), lift=0.34+0.13*sway;
        this.marker.position.set(arm.x+arm.side*(0.095+0.04*sway),arm.y+lift*0.44,arm.z+0.028);
        this.marker.rotation.set(0.24*sway,0,-arm.side*(0.48+0.29*sway));
        this.marker.scale.set(0.14,lift,0.15);this.marker.updateMatrix();
        arm.mesh.setMatrixAt(j,this.marker.matrix);
      });
      arms[0].mesh.instanceMatrix.needsUpdate=true;
    });
    const v=this.rider;
    const bob=Math.sin(this.time*10)*0.012;
    v.root.position.set(0,0.754+bob,1.2);
    v.body.rotation.set(-0.06,0,0.035);
    v.person.rotation.z=0.035+Math.sin(this.time*5)*0.028;
    v.wheels.forEach(w=>w.rotation.z=-((this.time*16.8)% (Math.PI*1.08))/0.54);
    v.shadow.position.set(0,0.014,1.2);
    const portrait=aspect<1;
    this.camera.aspect=aspect;
    this.camera.fov=portrait?46:37;
    this.camera.position.set(3.82,1.03,portrait?7.6:6.55);
    this.camera.lookAt(portrait?-0.20:-2.1,1.57,1.01);
    this.camera.updateProjectionMatrix();
    renderer.render(this.scene,this.camera);
  }
}
class RaceCrowd {
  readonly group=new T.Group();
  private readonly actors:T.InstancedMesh;
  private readonly fans:{x:number;y:number;z:number;phase:number;color:number;skin:number}[]=[];
  private readonly pose=new T.Object3D();
  private response=0;
  private mood:CrowdKind='landing';
  constructor(readonly distance:number,track:Track,rng:()=>number){
    const colors=[0xff514d,0xffd99b,0x65a7a9,0xf4ae44,0xb785cc,0xf5e9ce];
    const p=track.pose(distance,-10.0);
    this.group.position.set(p.x,p.y,p.z);
    this.group.rotation.y=-Math.atan2(p.fz,p.fx);
    const blocks:Block[]=[];
    for(let row=0;row<3;row++){
      const y=0.67+row*0.72,z=-row*1.04;
      blocks.push([0,y-0.42,z,9.7,0.62+row*0.38,1.04,row%2?0xa76a60:0xbf8472]);
      for(let i=0;i<9;i++){
        if(rng()<0.08)continue;
        const x=(i-4)*1.05+(rng()-0.5)*0.14;
        this.fans.push({x,y,z,phase:rng()*Math.PI*2,
          color:colors[Math.floor(rng()*colors.length)],skin:rng()<0.55?0xe0ab7c:0xa47351});
      }
    }
    batch(this.group,blocks);
    this.actors=new T.InstancedMesh(cube,decorationMaterial,this.fans.length*5);
    this.fans.forEach((fan,i)=>{
      [fan.color,fan.skin,fan.color,fan.color,fan.color].forEach((color,j)=>this.actors.setColorAt(i*5+j,new T.Color(color)));
    });
    this.actors.frustumCulled=false;
    this.group.add(this.actors);
    this.update(0,0,0,true);
  }
  react(kind:CrowdKind,strength:number){
    if(this.mood==='finish'&&kind!=='finish'&&this.response>0.3)return;
    this.mood=kind;
    this.response=Math.max(this.response*0.48,strength);
  }
  private part(i:number,x:number,y:number,z:number,w:number,h:number,d:number,tilt=0,roll=0){
    this.pose.position.set(x,y,z);this.pose.scale.set(w,h,d);
    this.pose.rotation.set(tilt,0,roll);this.pose.updateMatrix();
    this.actors.setMatrixAt(i,this.pose.matrix);
  }
  update(time:number,dt:number,near:number,visible:boolean){
    this.response=Math.max(0,this.response-dt*(this.mood==='gasp'?1.1:this.mood==='pass'?0.86:0.52));
    if(!visible)return;
    const cheer=this.mood==='gasp'?0:this.response,gasp=this.mood==='gasp'?this.response:0;
    this.fans.forEach((fan,i)=>{
      const beat=Math.sin(time*7+fan.phase), bounce=Math.max(0,beat);
      const wave=this.mood==='pass'?Math.max(0,Math.sin(time*8-fan.x*0.7)):1;
      const amplitude=this.mood==='lap'||this.mood==='finish'?1.2:1;
      const rise=near*(0.07+bounce*0.17)+cheer*wave*amplitude*(0.48+bounce*0.33)-gasp*0.19;
      const y=fan.y+rise,z=fan.z-gasp*0.30;
      this.part(i*5,fan.x,y,z,0.43,0.50,0.42,-gasp*0.41);
      this.part(i*5+1,fan.x,y+0.40,z-gasp*0.15,0.30,0.31,0.31);
      this.part(i*5+2,fan.x,y+0.58,z-gasp*0.15,0.33,0.065,0.33);
      for(let j=0;j<2;j++){
        const side=j?1:-1;
        const lift=clamp(near*(0.39+beat*0.26)+cheer*wave*1.12,0,1);
        this.part(i*5+3+j,fan.x+side*(0.25+lift*0.07),y+0.03+lift*0.49,z+gasp*0.27,
          0.14,0.55,0.15,gasp*1.17,side*(0.25+lift*0.38));
      }
    });
    this.actors.instanceMatrix.needsUpdate=true;
  }
}
export class View {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(33,1,0.15,170);
  private readonly title=new TitleTrack();
  private readonly desiredPosition=new T.Vector3();
  private readonly desiredFocus=new T.Vector3();
  private readonly focus=new T.Vector3();
  private cameraReady=false;
  private practiceWrap=0;
  cameraIndex:CameraIndex=0;
  private previousCamera:CameraIndex=0;
  private wasFirstPerson=false;
  reduceMotion=false;
  private renderer: T.WebGLRenderer;
  private readonly hemi=new T.HemisphereLight(0xffecd0,0x8b7f87,2.05);
  private readonly sun=new T.DirectionalLight(0xffead3,2);
  private readonly effects=new RaceEffects(this.scene);
  private readonly flags:{flag:T.Group; x:number}[]=[];
  private conditions=DEFAULT_CONDITIONS;
  private lightBase=2;
  private weatherAge=0;
  private world=new T.Group();
  private riders:RiderView[]=[];
  private crowds:RaceCrowd[]=[];
  private crowdSerial=0;
  private readonly visibility=new RiderVisibility();
  private dust:T.InstancedMesh;
  private particles:{x:number;y:number;z:number;life:number;size:number;color:number}[]=[];
  private track!:Track;
  private targetX=0;
  private targetY=0;
  private targetZ=0;
  private elapsed=0;
  private lastDust=0;
  private width=0;
  private height=0;
  quality=true;
  constructor(canvas:HTMLCanvasElement) {
    this.renderer=new T.WebGLRenderer({canvas, antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.scene.add(this.hemi,this.sun);
    this.scene.add(this.world);
    this.dust=new T.InstancedMesh(cube,new T.MeshStandardMaterial({roughness:1}),84);
    this.dust.count=0; this.dust.frustumCulled=false; this.scene.add(this.dust);
  }
  reset(track:Track,conditions:Conditions=DEFAULT_CONDITIONS) {
    this.track=track;
    this.conditions=conditions;
    this.weatherAge=0;
    this.flags.length=0;
    this.effects.reset(track,conditions);
    this.visibility.reset();
    this.world.traverse(o=>{if (o instanceof T.InstancedMesh) o.dispose(); else if(o instanceof T.Mesh && o.geometry !== cube) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); }});
    this.world.clear();
    this.crowds=[];this.crowdSerial=0;
    for(const r of this.riders) {
      this.scene.remove(r.root,r.shadow);
      r.shadow.material.dispose();
    }
    this.riders=[];
    this.cameraReady=false;this.practiceWrap=0;this.particles=[];this.targetX=5.7;this.targetY=0;this.targetZ=1.2;
    const palette=PALETTES[track.course.theme];
    const night=conditions.light==='Night', wet=conditions.weather!=='Clear';
    const sky=new T.Color(palette.sky);
    const fog=new T.Color(palette.fog);
    const light=conditions.light;
    if(light==='Morning'){sky.lerp(new T.Color(0xbad9ed),0.55);fog.lerp(new T.Color(0xc2d2df),0.55);}
    if(light==='Evening'){sky.lerp(new T.Color(0xf2916d),0.7);fog.lerp(new T.Color(0xa26371),0.45);}
    if(night){sky.setHex(0x050911);fog.setHex(0x0a1120);}
    if(wet){sky.lerp(new T.Color(night?0x080d17:0x667883),0.45);fog.lerp(sky,0.52);}
    this.scene.background=sky;
    this.scene.fog=new T.Fog(fog,night?28:wet?23:light==='Morning'?25:30,night?81:wet?94:125);
    this.hemi.color.setHex(night?0x9cbcff:light==='Morning'?0xe7f6ff:0xffecd0);
    this.hemi.intensity=(night?0.17:light==='Evening'?1.55:2.05)*(wet?0.87:1);
    this.sun.position.set(-12,night?12:light==='Evening'?5:light==='Morning'?8:18,8);
    this.sun.color.setHex(night?0x879de7:light==='Evening'?0xffb57a:0xffead3);
    this.lightBase=(night?0.055:light==='Evening'?1.65:2)*(wet?0.68:1);
    this.sun.intensity=this.lightBase;
    const rng=seeded(632+track.course.theme);
    const meshMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:1,side:T.DoubleSide});
    const loop=!!track.circuit;
    const limit=loop?track.lapLength:track.end+44;
    if(track.circuit)box(this.world,palette.grass,0,track.circuit.floor-0.48,45,1050,0.7,1050);
    const chunkLength=loop&&track.course.theme===2?16:38;
    for(let start=loop?0:-30;start<limit;start+=chunkLength){
      const stop=Math.min(start+chunkLength,limit);
      const vertices:number[]=[], colors:number[]=[], blocks:Block[]=[];
      const color=new T.Color();
      const block=(x:number,y:number,z:number,w:number,h:number,d:number,c:number)=>{
        if(loop&&Math.abs(z)>5.7&&!track.clearOfOtherRoad(x,z,Math.hypot(w,d)*0.50,y))return;
        const height=loop&&Math.abs(z)>5.7?y+track.pose(x).y:y;
        blocks.push([x,height,z,w,h,d,c]);
      };
      const breaks=[start,stop];
      for(let x=start+1.3;x<stop;x+=1.3) breaks.push(x);
      for(const s of track.segments) {
        if(s.end<start||s.x>stop)continue;
        breaks.push(...track.boundaries(s).filter(x=>x>start&&x<stop));
      }
      breaks.sort((a,b)=>a-b);
      function vertex(x:number,y:number,z:number) {
        const p=track.pose(x,z);
        vertices.push(p.x,y,p.z);colors.push(color.r,color.g,color.b);
      }
      for(let i=0;i<breaks.length-1;i++){
        const a=breaks[i],b=breaks[i+1];
        if(b-a<0.0001) continue;
        for(let j=0;j<depthStops.length-1;j++){
          const z0=depthStops[j],z1=depthStops[j+1],z=(z0+z1)/2;
          const surface=track.surface((a+b)/2,z);
          const paint=surface==='mud'?0x614235:surface==='cool'?0x267d76:surface==='rough'?0x697158:
            surface==='trap'?0x644d45:surface==='bump'?(j%2?0xe6d8c6:0xb42639):palette.dirt;
          color.setHex(paint)
            .multiplyScalar((j%2?1:0.97)*(0.92+rng()*0.14)*(1-wetness(track,conditions,(a+b)/2,z,surface)*0.37));
          vertex(a,track.height(a,z0),z0);vertex(a,track.height(a,z1),z1);vertex(b,track.height(b,z0),z0);
          vertex(a,track.height(a,z1),z1);vertex(b,track.height(b,z1),z1);vertex(b,track.height(b,z0),z0);
        }
        if(loop){
          for(const z of [-WIDTH/2,WIDTH/2]){
            color.setHex(palette.soil);
            const ha=track.height(a,z),hb=track.height(b,z);
            const floor=track.circuit!.floor;
            const bridge=track.course.theme===2;
            const depth=bridge?0.66:0.95;
            const da=Math.max(floor,ha-depth),db=Math.max(floor,hb-depth);
            vertex(a,ha,z);vertex(a,da,z);vertex(b,hb,z);
            vertex(a,da,z);vertex(b,db,z);vertex(b,hb,z);
            if(!bridge){
              const sa=z+Math.sign(z)*Math.min(8,2.1+ha-floor),sb=z+Math.sign(z)*Math.min(8,2.1+hb-floor);
              color.setHex(palette.rock).multiplyScalar(0.83);
              vertex(a,da,z);vertex(a,floor,sa);vertex(b,db,z);
              vertex(a,floor,sa);vertex(b,floor,sb);vertex(b,db,z);
            }
          }
        }
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
      g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.computeVertexNormals();
      const surfaceMesh=new T.Mesh(g,meshMaterial.clone());
      this.world.add(surfaceMesh);
      if(loop&&track.course.theme===2){
        const center=(start+stop)*0.5;
        this.visibility.addGroup(surfaceMesh,s=>Math.abs(track.delta(center,s))>chunkLength+8&&
          Math.hypot(track.pose(center).x-track.pose(s).x,track.pose(center).z-track.pose(s).z)<42);
      }
      if(!loop){
        block((start+stop)/2,-1.14,1.5,stop-start,0.85,41,palette.grass);
        block((start+stop)/2,-1.53,-22,stop-start,0.85,9,palette.far);
      }
      for(let x=start;x<stop;x+=1.9){
        for(const sign of [-1,1]){
          const top=track.height(x,sign*4.8);
          if(!loop){
            block(x,top/2-0.49,sign*5.05,1.94,top+0.99,0.62,palette.soil);
            block(x,top*0.31-0.5,sign*5.52,1.97,top*0.62+0.96,0.34,palette.rock);
          }
          block(x,top+0.035,sign*4.81,1.2,0.085,0.18,Math.floor(x/1.9)%2?palette.trim:0xb42332);
        }
        for(let l=0;l<4;l++){
          const z=LANES[l];
          const s=track.surface(x,z);
          if(s==='cool'){
            for(const dir of [-1,1]) {
              block(x,track.height(x,z)+0.045,z+dir*0.21,0.48,0.04,0.17,0xa3ffda);
              block(x+0.26,track.height(x+0.26,z)+0.045,z+dir*0.08,0.19,0.04,0.18,0xa3ffda);
            }
          } else if(s==='mud'||s==='rough'||s==='trap'){
            const h=track.height(x,z);
            if(s==='trap') {
              for(let k=0;k<4;k++) block(x+(rng()-0.5)*0.8,h+0.075,z+(rng()-0.5)*1.2,0.32+rng()*0.28,0.14+rng()*0.14,0.26+rng()*0.28, k%2?0x584338:0x846858);
            } else {
              block(x+rng()*0.55,h+0.022,z+(rng()-0.5)*1.6,0.55+rng()*0.8,0.047,0.13+rng()*0.2,s==='mud'?0x4a352e:0x879070);
            }
          } else if(rng()<0.34) {
            const dz=(rng()-0.5)*1.7;
            block(x,track.height(x,z+dz)+0.017,z+dz,0.23+rng()*0.55,0.042,0.1,0xa26a49);
          }
        }
      }
      if(track.circuit&&track.course.theme===2){
        for(let x=start+5;x<stop;x+=8){
          const top=track.pose(x).y-0.65,bottom=track.circuit.floor;
          for(const z of [-3.3,3.3]){
            if(top-bottom>2.2&&track.clearOfOtherRoad(x,z,1.5,(bottom+top)/2-track.pose(x).y)){
              blocks.push([x,(top+bottom)/2,z,1.6,top-bottom,1.2,0x64505a]);
            }
          }
        }
      }
      for(let x=start+1;x<stop;x+=3.5){
        block(x,-0.04,-6.8,0.14,1.36,0.16,0x392f32);
        block(x+1.7,0.35,-6.8,3.45,0.15,0.15,0xe9cf9d);
        block(x+1.7,0.01,-6.8,3.45,0.1,0.13,palette.trim);
        if(rng()<0.65) {
          const z=6.1+rng()*4.8;
          block(x,-0.63,z,0.35+rng()*0.68,0.2+rng()*0.37,0.45+rng()*0.45,palette.rock);
          for(let j=0;j<3;j++)block(x+0.42+j*0.13,-0.57+j*0.045,z+0.4-j*0.11,0.10,0.27+j*0.065,0.11,0x869064);
        }
      }
      for(let x=start+4;x<stop;x+=9){
        const high=5+rng()*8;
        for(let layer=0;layer<4;layer++){
          block(x+rng()*4,high*layer*0.25-1.0,-27-rng()*5,10+rng()*10-layer,high*0.53,10-layer*0.7,palette.far);
          if(track.course.theme===1||track.course.theme===4) block(x+1,layer*1.13-0.3,-15-layer*1.5,9+rng()*3-layer,1.24,3.3,palette.rock);
        }
        if(track.course.theme===3){
          block(x,1.8,-14,7.7,5.3,4.7,0x762938);
          block(x,4.47,-14,8.1,0.34,5,0xe5b6a4);
          block(x,1.95,-11.55,5.5,2.7,0.16,0x4a3036);
          for(const dx of [-3.5,-1.65,1.65,3.5])block(x+dx,3.2,-11.34,0.22,7.9,0.26,0xb64145);
          block(x,6.73,-13.2,7.8,0.28,0.34,0xe6b4a0);
        }
        if(track.course.theme===4){
          block(x,0.65,-9.3,3.5,0.19,1.6,0xf3dfcb);
          for(let j=0;j<5;j++)block(x+j*0.54,0.65+j*0.46,-17-j*0.11,3.3-j*0.29,0.82+j*0.65,2.2, j%2?0xe1d5c3:0xb5a8a1);
        }
        if(track.course.theme===2){
          const tent=[0xa05265,0xe6a667,0x467789][Math.floor(rng()*3)];
          block(x,0.51,-14,5.4,2.25,3.6,tent);
          for(let j=0;j<4;j++) block(x,1.68+j*0.33,-14,5.6-j*0.94,0.38,3.85-j*0.7,tent);
          block(x,0.16,-12.16,1.6,1.63,0.14,0xffd386);
        }
        if(track.course.theme===0 && rng()<0.64){
          const flag=[0xc83242,0xf5e3d3,0xa72f38][Math.floor(rng()*3)];
          block(x,2.65,-8.35,0.105,5.45,0.1,0x5c6057);
          if(wet&&track.clearOfOtherRoad(x,-8.35,0.65,4.86)){
            const fabric=new T.Group();
            this.place(fabric,x,4.86,-8.35);
            for(let j=0;j<3;j++)box(fabric,flag,0.29+j*0.31,j*0.035,0,0.34,0.74-j*0.19,0.105);
            this.world.add(fabric);this.flags.push({flag:fabric,x});
            this.visibility.addGroup(fabric);
          }else for(let j=0;j<3;j++)block(x+0.29+j*0.31,4.86+j*0.035,-8.35,0.34,0.74-j*0.19,0.105,flag);
        }
        if(rng()<0.42){
          block(x,1.96,-8.25,0.19,5.5,0.2,0x374754);
          block(x,4.73,-8.25,2,0.25,0.44,0x3c4b55);
          for(let j=-1;j<=1;j++)block(x+j*0.57,4.69,-7.98,0.35,0.16,0.1,palette.sun);
        }
        if(rng()<0.64){
          const z=-22-rng()*7;
          block(x,0.78,z,0.34,2.7,0.44,0x694d47);
          for(let j=0;j<4;j++)block(x,1.65+j*0.56,z,3.2-j*0.62,0.59,2.95-j*0.5, j%2?0x566e58:0x63806b);
        }
      }
      const scenery=batch(this.world,blocks,track);
      this.visibility.addInstances(scenery,blocks.flatMap((b,i)=>Math.abs(b[2])>5.2||b[4]>2.2?[i]:[]));
    }
    meshMaterial.dispose();
    if(loop)this.banner(0,0,'START / FINISH',palette.trim);
    else{
      this.banner(11,0,'VOXEL BIKES',palette.trim);
      for(const [index,x] of track.markers.entries())this.banner(x,0,index+1===track.laps?'FINISH':'LAP 2',palette.trim);
    }
    for(let x=66;x<limit-20;x+=95){
      if(track.clearOfOtherRoad(x,-7.1,2.15,0.92))this.sign(x,x%2?'MX / 04':'DIRT CLUB',palette.trim);
    }
    const crowdSpacing=track.course.theme===0?24:40;
    const crowdSpots=new Set<number>();
    for(let x=6;x<limit-9;x+=crowdSpacing)crowdSpots.add(x);
    for(const section of track.segments){
      const x=(section.x+section.end)*0.5;
      if(['tabletop','split','drop','super','massif'].includes(section.piece)&&
        ![...crowdSpots].some(s=>Math.abs(track.delta(s,x))<11))crowdSpots.add(x);
    }
    for(const x of crowdSpots){
      if(!track.clearOfOtherRoad(x,-10,5.5,1.4))continue;
      const crowd=new RaceCrowd(x,track,rng);
      this.crowds.push(crowd);this.world.add(crowd.group);
      this.visibility.addGroup(crowd.group,s=>Math.abs(track.delta(x,s))<45);
    }
    const cloudBlocks:Block[]=[];
    for(let x=loop?0:-50;x<(loop?track.lapLength:track.end+80);x+=33) {
      const y=10+rng()*8, z=-39-rng()*21;
      for(let i=0;i<6;i++)cloudBlocks.push([x+i*2.3,y+rng()*1.6,z+rng()*4,3+rng()*5,0.65+rng()*1.05,3+rng()*5,track.course.theme===2?0x8398aa:0xe4d9c6]);
    }
    batch(this.world,cloudBlocks,track);
  }
  private label(text:string,accent:number) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#9f2032';ctx.fillRect(0,0,512,96);
    ctx.fillStyle='#'+accent.toString(16).padStart(6,'0');ctx.fillRect(0,0,512,7);ctx.fillRect(0,89,512,7);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)if((i+j)%2===0){ctx.fillRect(20+i*9,30+j*9,9,9);ctx.fillRect(456+i*9,30+j*9,9,9);}
    ctx.font='900 49px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff1e4';ctx.fillText(text,256,49,365);
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    return new T.MeshBasicMaterial({map:texture,side:T.DoubleSide});
  }
  private place(object:T.Object3D,x:number,y:number,z:number){
    const p=this.track.pose(x,z);
    object.position.set(p.x,y+p.y,p.z);
    object.rotation.y-=Math.atan2(p.fz,p.fx);
  }
  private banner(x:number,y:number,text:string,accent:number) {
    const blocks:Block[]=[];
    for(let j=0;j<8;j++)blocks.push([x,y+0.32+j*0.64,-5.4,0.39,0.64,0.42,j%2?0xb42334:accent]);
    blocks.push([x,y+5.06,-0.2,0.33,0.38,10.4,0xb42334]);
    const support=batch(this.world,blocks.map(([s,py,z,w,h,d,c])=>[s,py+this.track.pose(s).y,z,w,h,d,c]),this.track);
    this.visibility.addInstances(support,blocks.map((_,i)=>i));
    const label=new T.Mesh(new T.PlaneGeometry(8.5,1.6),this.label(text,accent));
    label.material.side=T.FrontSide;
    label.rotation.y=-Math.PI/2;this.place(label,x-0.22,y+5.55,0);
    const reverse=new T.Mesh(label.geometry.clone(),label.material.clone());
    reverse.rotation.y=Math.PI/2;this.place(reverse,x+0.22,y+5.55,0);
    // A second board faces the side-on race camera.
    const side=new T.Mesh(new T.PlaneGeometry(4.8,0.9),label.material.clone());
    this.place(side,x,y+5.55,-4.35);
    this.world.add(label,reverse,side);
    for(const board of [label,reverse,side])this.visibility.addGroup(board,s=>Math.abs(this.track.delta(x,s))<45);
    if(text!=='VOXEL BIKES'){
      const line:Block[]=[];
      for(let i=0;i<16;i++)for(let j=0;j<2;j++)line.push([x+j*0.34,this.track.height(x+j*0.34,-4.5+i*0.6)+0.028,-4.5+i*0.6,0.34,0.038,0.60,(i+j)%2?0x303235:0xf3e1be]);
      batch(this.world,line,this.track);
    }
  }
  private sign(x:number,text:string,accent:number){
    const label=new T.Mesh(new T.PlaneGeometry(4.3,0.8),this.label(text,accent));
    this.place(label,x,0.92,-7.1);this.world.add(label);
    this.visibility.addGroup(label,s=>Math.abs(this.track.delta(x,s))<45);
  }
  frame(dt:number,race:Race|undefined,alpha:number) {
    const canvas=this.renderer.domElement;
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h)return;
    const pixelRatio=Math.min(this.quality?1.65:1,devicePixelRatio);
    if(w!==this.width||h!==this.height||pixelRatio!==this.renderer.getPixelRatio()){
      this.width=w;this.height=h;this.renderer.setPixelRatio(pixelRatio);this.renderer.setSize(w,h,false);
      this.camera.aspect=w/h;
      this.camera.updateProjectionMatrix();
    }
    if(!race){this.title.frame(this.renderer,dt,this.camera.aspect,!this.reduceMotion);return;}
    this.elapsed+=dt;
    const bikes:Bike[]=[race.rider,...race.rivals].map((b,i)=>{
      const prev=race.previous[i];
      return {...b,x:blend(prev.x,b.x,alpha),y:blend(prev.y,b.y,alpha),z:blend(prev.z,b.z,alpha),
        pitch:blend(prev.pitch,b.pitch,alpha),lean:blend(prev.lean,b.lean,alpha),spin:blend(prev.spin,b.spin,alpha),
        crash:prev.crashKind===b.crashKind?blend(prev.crash,b.crash,alpha):b.crash};
    });
    const r=bikes[0];
    if(race.wrapSerial!==this.practiceWrap){
      const offset=(race.wrapSerial-this.practiceWrap)*this.track.lapLength;
      this.targetX-=offset;
      for(const particle of this.particles)particle.x-=offset;
      this.practiceWrap=race.wrapSerial;
    }
    const n=bikes.length;
    while(this.riders.length<n){
      const rival=this.riders.length>0;
      const spec=bikeStats(race.loadout);
      const view=makeRider(this.scene,rival?[0xd32a3c,0x56bcb6,0xffc35d,0x8c91e8][this.riders.length]:spec.color,
        false,rival?'starter':race.loadout.bike);
      if(rival)this.visibility.addGroup(view.root);
      this.riders.push(view);
    }
    const ghost=race.ghost;
    if(ghost&&this.riders.length===n)this.riders.push(makeRider(this.scene,0xbafcf2,true,ghost.loadout?.bike??'starter'));
    const showGhost=ghost && race.time>=0 && race.time<=ghost.frames[ghost.frames.length-1][0];
    if(showGhost){
      const i=clamp(Math.floor(race.time/(DT*6)),0,ghost.frames.length-1);
      const a=ghost.frames[i],b=ghost.frames[Math.min(i+1,ghost.frames.length-1)];
      const t=clamp((race.time-a[0])/Math.max(0.001,b[0]-a[0]),0,1);
      bikes.push({...r,x:blend(a[1],b[1],t),y:blend(a[2],b[2],t),z:blend(a[3],b[3],t),
        pitch:blend(a[4],b[4],t),spin:blend(a[5],b[5],t),impact:0,
        crash:(a[7]===b[7]?blend(a[6],b[6],t):a[6])*CRASH_TIME/RECORDED_CRASH_TIME,crashKind:a[7],lean:blend(a[8],b[8],t),side:a[9]});
    }
    const firstPerson=this.cameraIndex===4&&!r.crash&&!r.finish;
    this.riders.forEach((view,i)=>{
      const bike=bikes[i];
      view.root.visible=!!bike;
      view.shadow.visible=!!bike&&i<n;
      if(!bike)return;
      const ground=this.track.height(bike.x,bike.z);
      const pose=this.track.pose(bike.x,bike.z), yaw=-Math.atan2(pose.fz,pose.fx);
      view.root.position.set(pose.x,bike.y,pose.z);
      view.root.rotation.y=yaw;
      view.body.rotation.set(bike.lean-(bike.air?0:Math.atan(this.track.bank(pose.curvature))),0,bike.pitch);
      view.person.position.set(0,-bike.impact*0.13,0);
      view.person.rotation.set(0,0,-bike.impact*0.17-bike.wheelie*0.14+
        Math.sin(this.elapsed*18)*Math.min(0.025,bike.speed/900));
      view.fork.scale.y=0.14-bike.impact*0.026;
      view.wheels.forEach(w=>{w.rotation.z=bike.spin;w.position.y=-0.18+bike.impact*0.08;});
      view.person.visible=i!==0||!firstPerson;
      view.gloves.visible=!bike.crash;
      view.steering.rotation.y=clamp(-bike.lean*0.38,-0.16,0.16);
      view.steering.position.y=0.80-bike.impact*0.07;
      if(bike.crash)animateCrash(view,this.track,bike,ground);
      else poseLegsAndArms(view,0);
      view.shadow.position.set(pose.x,ground+0.040,pose.z);
      view.shadow.rotation.set(-Math.atan(this.track.bank(pose.curvature)),yaw,this.track.slope(bike.x,bike.z),'YXZ');
      (view.shadow.material as T.MeshBasicMaterial).opacity=clamp(0.26-(bike.y-ground-0.72)*0.054,0.06,0.28);
    });
    if(race&&race.time>0&&!race.done&&this.elapsed-this.lastDust>0.034){
      this.lastDust=this.elapsed;
      for(const bike of bikes.slice(0,n)){
        if(bike.finish||bike.air||(!bike.crash&&bike.speed<4)||this.particles.length>=84)continue;
        if(bike.crash && CRASH_TIME-bike.crash>0.8)continue;
        const surface=this.track.surface(bike.x,bike.z);
        const mud=surface==='mud'||surface==='trap';
        const wet=wetness(this.track,this.conditions,bike.x,bike.z,surface)>0;
        const spray=wet?(mud?0x654c3c:0x88a4ac):mud?0x785847:0xcd9b73;
        this.particles.push({x:bike.x-0.92,y:bike.y-0.5,z:bike.z+(Math.random()-0.5)*(wet?0.92:0.49),life:wet?0.32:0.45,size:0.12+Math.random()*0.18,color:spray});
      }
    }
    this.particles=this.particles.filter(p=>p.life>0);
    this.dust.count=this.particles.length;
    const obj=new T.Object3D(),color=new T.Color();
    this.particles.forEach((p,i)=>{
      p.life-=dt;p.y+=dt*0.58;p.x-=dt*1.5;
      const pose=this.track.pose(p.x,p.z);
      obj.position.set(pose.x,p.y,pose.z);
      obj.scale.setScalar(p.size*clamp(p.life*4,0.1,1));obj.rotation.y=i*0.9;obj.updateMatrix();
      this.dust.setMatrixAt(i,obj.matrix);this.dust.setColorAt(i,color.setHex(p.color));
    });
    this.dust.instanceMatrix.needsUpdate=true;
    if(this.dust.instanceColor)this.dust.instanceColor.needsUpdate=true;
    const events=race.crowd.filter(event=>event.serial>this.crowdSerial);
    this.crowdSerial=events.at(-1)?.serial??this.crowdSerial;
    for(const crowd of this.crowds){
      for(const event of events){
        const distance=Math.abs(this.track.delta(crowd.distance,event.x));
        const reach=event.kind==='finish'||event.kind==='lap'?53:34;
        if(distance<reach)crowd.react(event.kind,(1-distance/(reach+24))*(this.reduceMotion?0.45:1));
      }
      const distance=Math.abs(this.track.delta(crowd.distance,r.x));
      crowd.update(this.elapsed,dt,this.reduceMotion?0:clamp(1-distance/19,0,1),distance<105||events.length>0);
    }
    this.weatherAge=Math.max(0,race.time);
    const wind=this.conditions.weather==='Thunderstorm'?1.5:this.conditions.weather==='Rain'?0.8:0.2;
    for(const {flag,x} of this.flags){
      if(Math.abs(this.track.delta(x,r.x))>105)continue;
      const flutter=this.reduceMotion?0:Math.sin(this.weatherAge*8+x)*wind*0.16;
      flag.rotation.x=flutter;
      for(const [i,panel] of flag.children.entries())panel.position.z=flutter*(i+1)*0.72;
    }
    const storm=this.conditions.weather==='Thunderstorm'&&!this.reduceMotion;
    const flashPhase=(this.weatherAge+2)%20;
    this.sun.intensity=this.lightBase+(storm?Math.max(0,1-Math.abs(flashPhase-0.34)/0.28)*0.55:0);
    const aspect=this.camera.aspect, portrait=aspect<1;
    const lead=r.crashKind===CrashKind.Back?3.8:5.0;
    const ground=this.track.height(r.x,r.z), nearEdge=this.track.height(r.x-2,4.7);
    const lift=Math.max(ground,nearEdge*0.79+ground*0.21)+Math.max(0,r.y-ground-0.72)*0.38;
    this.targetX=blend(this.targetX,r.x+lead,this.cameraReady?1-Math.exp(-dt*11):1);
    this.targetY=blend(this.targetY,lift,this.cameraReady?1-Math.exp(-dt*8):1);
    this.targetZ=blend(this.targetZ,r.z,this.cameraReady?1-Math.exp(-dt*6):1);
    const x=this.targetX,y=this.targetY,z=this.targetZ;
    const sideDepth=Math.max(14.9,23/aspect);
    const wideDepth=Math.max(21,30/aspect);
    let fov=portrait?44:33;
    switch(r.finish?3:this.cameraIndex){
      case 1:
        this.desiredPosition.set(x-7.8,y+11.0,z+wideDepth);
        this.desiredFocus.set(x+2.1,y+0.7,z-1.4);fov=38;
        break;
      case 4:
      case 2:
        this.desiredPosition.set(x-13.7,y+4.9,z+1.9);
        this.desiredFocus.set(x+6.6,y+1.0,z-0.2);fov=55;
        break;
      case 3:
        this.desiredPosition.set(x+5.8,y+3.05,z+Math.max(9.0,15/aspect));
        this.desiredFocus.set(x-1.0,y+1.45,z-0.15);fov=47;
        break;
      default:
        this.desiredPosition.set(x-7.2,y+1.88,z+sideDepth);
        this.desiredFocus.set(x+0.25,y+2.12,z-0.4);
    }
    if(this.track.circuit){
      const anchor=this.track.pose(r.x);
      const offset=this.desiredPosition.x-r.x, lateral=this.desiredPosition.z;
      this.desiredPosition.x=anchor.x+anchor.fx*offset-anchor.fz*lateral;
      this.desiredPosition.z=anchor.z+anchor.fz*offset+anchor.fx*lateral;
      const ahead=this.track.pose(this.desiredFocus.x,this.desiredFocus.z);
      this.desiredFocus.x=ahead.x;this.desiredFocus.z=ahead.z;
    }
    if(firstPerson){
      const {body}=this.riders[0];
      body.updateWorldMatrix(true,false);
      const slope=this.track.slope(r.x,r.z);
      const pitch=clamp((r.pitch-slope)*0.53+slope,-0.50,0.65);
      const road=this.track.pose(r.x,r.z);
      const look=this.track.pose(r.x+12,r.z);
      this.desiredPosition.set(-0.77,1.36,0).applyMatrix4(body.matrixWorld);
      this.desiredFocus.set(blend(this.desiredPosition.x+road.fx*12,look.x,0.42),
        this.desiredPosition.y+Math.tan(pitch)*12-1.90,
        blend(this.desiredPosition.z+road.fz*12,look.z,0.42));
      fov=74;
    }
    const sameView=this.previousCamera===this.cameraIndex&&this.wasFirstPerson===firstPerson;
    const cameraBlend=this.cameraReady&&sameView&&!this.reduceMotion?1-Math.exp(-dt*(firstPerson?22:12)):1;
    this.previousCamera=this.cameraIndex;
    this.wasFirstPerson=firstPerson;
    this.camera.position.lerp(this.desiredPosition,cameraBlend);
    this.focus.lerp(this.desiredFocus,cameraBlend);
    this.camera.fov=blend(this.camera.fov,fov,cameraBlend);
    this.camera.lookAt(this.focus);
    this.cameraReady=true;
    this.camera.updateProjectionMatrix();
    this.effects.frame(dt,this.weatherAge,this.camera,r,bikes.slice(0,n),this.riders,this.conditions,race.inputs.turbo,wind,this.quality,this.reduceMotion);
    this.scene.updateMatrixWorld(true);
    this.visibility.update(this.camera,this.riders[0].person,r.x,dt);
    this.renderer.render(this.scene,this.camera);
  }
}
