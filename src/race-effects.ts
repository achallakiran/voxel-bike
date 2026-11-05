import * as T from 'three';
import {clamp, type Bike, type Track} from './race';
import type {Conditions} from './conditions';

type Smoke={position:T.Vector3; age:number; life:number; size:number; heat:boolean};

export class RaceEffects {
  private readonly headlight=new T.SpotLight(0xffe0ae,620,37,0.37,0.63,1.4);
  private readonly finishLights=[new T.PointLight(0xffe2c5,84,22,1.25),new T.PointLight(0xe0eaff,68,20,1.25)];
  private readonly markers=new T.InstancedMesh(new T.BoxGeometry(0.30,0.045,0.19),new T.MeshBasicMaterial({color:0xa0a5a5}),768);
  private readonly exhaust=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshBasicMaterial({
    transparent:true,opacity:0.33,depthWrite:false
  }),72);
  private readonly drops=new Float32Array(204*6);
  private readonly rain:T.LineSegments;
  private readonly transform=new T.Object3D();
  private readonly tint=new T.Color();
  private readonly anchor=new T.Vector3();
  private readonly direction=new T.Vector3();
  private readonly side=new T.Vector3();
  private readonly puffs:Smoke[]=[];
  private track!:Track;
  private lastPuff=0;
  constructor(scene:T.Scene){
    const rainGeometry=new T.BufferGeometry();
    rainGeometry.setAttribute('position',new T.BufferAttribute(this.drops,3).setUsage(T.DynamicDrawUsage));
    this.rain=new T.LineSegments(rainGeometry,new T.LineBasicMaterial({color:0xc9e1f2,transparent:true,opacity:0.32,depthWrite:false}));
    this.rain.frustumCulled=false;this.exhaust.frustumCulled=false;
    this.rain.visible=false;this.exhaust.count=0;this.markers.count=0;
    this.headlight.visible=false;
    for(const light of this.finishLights)light.visible=false;
    scene.add(this.headlight,this.headlight.target,...this.finishLights,this.markers,this.exhaust,this.rain);
  }
  reset(track:Track,conditions:Conditions){
    this.track=track;
    this.lastPuff=-1;
    this.puffs.length=0;this.exhaust.count=0;this.markers.count=0;
    const night=conditions.light==='Night';
    (this.rain.material as T.LineBasicMaterial).opacity=night?0.20:0.32;
    this.headlight.visible=night;this.rain.visible=conditions.weather!=='Clear';
    const finish=track.circuit?0:track.end;
    for(const [index,light] of this.finishLights.entries()){
      const z=index?-6.2:6.2;
      const p=track.pose(finish+index*5,z);
      light.position.set(p.x,p.y+6,p.z);light.visible=night;
    }
    if(!night)return;
    const end=track.circuit?track.lapLength:track.end;
    const step=Math.max(5,end/375);
    this.transform.scale.setScalar(1);
    for(let x=0;x<end;x+=step)for(const z of [-4.55,4.55]){
      const p=track.pose(x,z);
      this.transform.position.set(p.x,track.height(x,z)+0.06,p.z);
      this.transform.rotation.set(0,-Math.atan2(p.fz,p.fx),0);
      this.transform.updateMatrix();this.markers.setMatrixAt(this.markers.count++,this.transform.matrix);
    }
    this.markers.instanceMatrix.needsUpdate=true;
    this.markers.computeBoundingSphere();
  }
  frame(dt:number,time:number,camera:T.Camera,rider:Bike,bikes:Bike[],riders:{body:T.Group}[],
      conditions:Conditions,turbo:boolean,wind:number,quality:boolean,reduced:boolean){
    if(this.headlight.visible){
      const body=riders[0].body;
      body.updateWorldMatrix(true,false);
      this.anchor.set(0.67,0.50,0).applyMatrix4(body.matrixWorld);
      this.headlight.position.copy(this.anchor);
      const ahead=this.track.pose(rider.x+13,rider.z);
      this.headlight.target.position.set(ahead.x,this.track.height(rider.x+13,rider.z)+0.28,ahead.z);
    }
    const interval=rider.hot?0.078:turbo?0.10:0.24;
    if(time>0&&time-this.lastPuff>=interval){
      this.lastPuff=time;
      bikes.forEach((bike,index)=>{
        if(bike.finish||(!bike.hot&&(bike.crash||bike.speed<3))||this.puffs.length>=72)return;
        if(index&&Math.abs(this.track.delta(bike.x,rider.x))>35)return;
        if(index&&!bike.hot&&Math.random()<0.70)return;
        const {body}=riders[index];
        body.updateWorldMatrix(true,false);
        const position=new T.Vector3(bike.hot?0.06:-0.94,bike.hot?0.35:0.16,0.28).applyMatrix4(body.matrixWorld);
        this.puffs.push({position,age:0,life:bike.hot?1.25:0.53,size:bike.hot?0.26:0.13,heat:bike.hot});
      });
    }
    for(let i=this.puffs.length-1;i>=0;i--){
      const puff=this.puffs[i];
      puff.age+=dt;
      if(puff.age>=puff.life){this.puffs.splice(i,1);continue;}
      puff.position.x+=dt*wind*0.7;puff.position.z+=dt*wind*0.82;
      puff.position.y+=dt*(puff.heat?0.98:0.38);
    }
    this.exhaust.count=this.puffs.length;
    this.puffs.forEach((puff,i)=>{
      const progress=puff.age/puff.life;
      this.transform.position.copy(puff.position);
      this.transform.rotation.set(i*1.7,progress*0.75,i*1.1);
      this.transform.scale.setScalar(puff.size*(1+progress*2.6)*(1-progress*progress));
      this.transform.updateMatrix();this.exhaust.setMatrixAt(i,this.transform.matrix);
      this.exhaust.setColorAt(i,this.tint.setHex(puff.heat?0x7e858a:0xc3b8ad));
    });
    this.exhaust.instanceMatrix.needsUpdate=true;
    if(this.exhaust.instanceColor)this.exhaust.instanceColor.needsUpdate=true;
    if(!this.rain.visible)return;
    camera.getWorldDirection(this.direction);this.direction.y=0;this.direction.normalize();
    this.side.set(-this.direction.z,0,this.direction.x);
    const storm=conditions.weather==='Thunderstorm';
    const count=reduced?46:quality?storm?204:132:storm?104:74;
    for(let i=0;i<count;i++){
      const offset=((i*0.618033989)%1-0.5)*31;
      const depth=2+((i*0.392171)%1)*30;
      const fall=((i*0.274003+time*(storm?1.06:0.85))%1);
      const y=camera.position.y+9-fall*16;
      const x=camera.position.x+this.direction.x*depth+this.side.x*offset+fall*wind;
      const z=camera.position.z+this.direction.z*depth+this.side.z*offset+fall*wind*0.6;
      const j=i*6, length=clamp(depth*0.026,0.18,0.70);
      this.drops.set([x,y,z,x+wind*0.06,y-length,z+wind*0.04],j);
    }
    this.rain.geometry.setDrawRange(0,count*2);
    this.rain.geometry.attributes.position.needsUpdate=true;
  }
}
