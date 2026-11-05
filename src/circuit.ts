import {CatmullRomCurve3,Vector3} from 'three';

type Point = [x:number,z:number,elevation?:number];
export interface TrackPose {x:number;z:number;y:number;fx:number;fz:number;curvature:number}
const ROUTES:Point[][]=[
  // Stadium oval with long straights and two wide banked ends.
  [[0,0],[60,0],[110,1],[143,16],[151,49],[133,76],[88,84],[28,84],[-44,83],[-82,65],[-87,34],[-67,8],[-32,0]],
  // A quarry rim descent, switchback in the pit, then a long uphill return.
  [[0,0,6],[56,-1,7],[105,9,2],[145,39,-8],[151,65,-9],[120,78,-8],[83,61,-6],[56,78,-3],[67,114,0],[18,142,3],[-48,123,5],[-75,80,8],[-65,34,9],[-37,3,6]],
  // A figure eight. The second crossing rides on a bridge.
  [[0,0],[46,0],[81,12],[107,38,0],[139,67,1],[182,77,1],[215,61,0],[218,24,0],[190,2,2],[152,6,5],[109,35,9],[72,68,6],[25,88,1],[-25,79],[-63,54],[-64,20],[-35,0]],
  // Offset straights, a sweeping turnaround, and a compact industrial infield.
  [[0,0],[61,0],[110,1],[140,18,2],[147,52,4],[121,82,2],[82,90],[50,73],[15,74],[-7,103,3],[-57,117,3],[-99,98],[-106,62],[-83,28],[-51,1]],
  // A long ridge with a high exposed crest and a tight, descending last turn.
  [[0,0,2],[57,-2,4],[120,-4,9],[164,11,13],[197,42,15],[209,80,9],[179,118,3],[118,140,0],[60,133,2],[23,119,5],[-20,137,6],[-62,126,4],[-83,89,0],[-74,48,-3],[-43,23,0],[-37,3,2]],
];
const interpolate=(a:number,b:number,t:number)=>a+(b-a)*t;
const wrap=(n:number,length:number)=>((n%length)+length)%length;

export class Circuit {
  private readonly samples:TrackPose[]=[];
  private readonly step:number;
  readonly floor:number;
  constructor(theme:number, readonly length:number){
    const spline=new CatmullRomCurve3(ROUTES[theme].map(([x,z,y=0])=>new Vector3(x,y,z)),true,'centripetal');
    const raw=spline.getPoints(4096);
    const lengths=[0];
    for(let i=1;i<raw.length;i++){
      lengths.push(lengths[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].z-raw[i-1].z));
    }
    const total=lengths[lengths.length-1], scale=length/total;
    const count=Math.ceil(length/0.48);
    this.step=length/count;
    let cursor=1;
    let minY=Infinity;
    for(let i=0;i<count;i++){
      const distance=total*i/count;
      while(lengths[cursor]<distance)cursor++;
      const a=raw[cursor-1],b=raw[cursor],t=(distance-lengths[cursor-1])/(lengths[cursor]-lengths[cursor-1]);
      const y=interpolate(a.y,b.y,t);
      minY=Math.min(minY,y);
      this.samples.push({x:interpolate(a.x,b.x,t)*scale,z:interpolate(a.z,b.z,t)*scale,y,fx:1,fz:0,curvature:0});
    }
    this.floor=minY-1.1;
    for(let i=0;i<count;i++){
      const a=this.samples[(i+count-2)%count],b=this.samples[(i+2)%count];
      const distance=Math.hypot(b.x-a.x,b.z-a.z);
      this.samples[i].fx=(b.x-a.x)/distance;
      this.samples[i].fz=(b.z-a.z)/distance;
    }
    for(let i=0;i<count;i++){
      const span=9,a=this.samples[(i+count-span)%count],b=this.samples[(i+span)%count];
      const turn=Math.atan2(a.fx*b.fz-a.fz*b.fx,a.fx*b.fx+a.fz*b.fz);
      this.samples[i].curvature=turn/(2*span*this.step);
    }
  }
  sample(distance:number,lateral=0):TrackPose{
    const point=wrap(distance,this.length)/this.step, index=Math.floor(point), f=point-index;
    const a=this.samples[index],b=this.samples[(index+1)%this.samples.length];
    const dx=interpolate(a.fx,b.fx,f), dz=interpolate(a.fz,b.fz,f), norm=Math.hypot(dx,dz);
    const fx=dx/norm,fz=dz/norm;
    return {
      x:interpolate(a.x,b.x,f)-lateral*fz,z:interpolate(a.z,b.z,f)+lateral*fx,
      y:interpolate(a.y,b.y,f),fx,fz,curvature:interpolate(a.curvature,b.curvature,f),
    };
  }
}
