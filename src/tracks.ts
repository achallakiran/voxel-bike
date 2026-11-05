export const LANES = [-3.6, -1.2, 1.2, 3.6];
export const WIDTH = 9.6;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const blend = (a: number, b: number, t: number) => a + (b - a) * t;

export type Surface = 'dirt' | 'mud' | 'rough' | 'cool' | 'trap' | 'bump';
type Feature = [surface: Surface, laneMask: number, from: number, to: number];
interface PieceSpec {
  name: string; length: number; shape: number[]; icon: string;
  code?: string; lanes?: number; features?: Feature[];
}
const flat = [0, 0];
export const PIECES = {
  straight: {name:'Straight', length:28, shape:flat, icon:'━'},
  tabletop: {name:'Tabletop', length:40, shape:[0,0,2.8,2.8,2.6,0,0], icon:'▲'},
  rollers: {name:'Rollers', length:30, shape:[0,0.75,0,1.05,0,0.62,0], icon:'∿'},
  double: {name:'Double', length:38, shape:[0,0,2.45,0.18,1.8,0,0], icon:'⋀'},
  mud: {name:'Mud', length:32, shape:flat, icon:'≋'},
  cool: {name:'Cooling strip', length:29, shape:flat, icon:'»'},
  drop: {name:'Step-down', length:46, shape:[0,0.2,3.9,3.7,0.8,0,0], icon:'◿'},
  hop: {code:'A', name:'Low kicker', length:15, shape:[0,0,0.72,0,0], icon:'⌃'},
  rise: {code:'B', name:'Medium kicker', length:17, shape:[0,0,1.35,0,0], icon:'⌃'},
  crest: {code:'C', name:'High kicker', length:21, shape:[0,0,2.25,0.48,0], icon:'⌃'},
  lowdeck: {code:'D', name:'Low deck', length:25, shape:[0,0.8,0.88,0.82,0], icon:'▱'},
  steep: {code:'E', name:'Steep kicker', length:20, shape:[0,0,0.18,2.8,0,0], icon:'▲'},
  launch: {code:'F', name:'Launch ramp', length:22, shape:[0,0.15,1.1,2.7,0.85,0], icon:'◢'},
  catch: {code:'G', name:'Landing ramp', length:24, shape:[0,2.55,2.18,1.48,0.67,0], icon:'◣'},
  super: {code:'H', name:'Super jump', length:22, shape:[0,0,0.15,3.25,0.65,0], icon:'▲'},
  bumpFar: {code:'I', name:'Far speed bump', length:16, shape:flat, icon:'╍', features:[['bump',3,0.47,0.56]]},
  bumpNear: {code:'J', name:'Near speed bump', length:16, shape:flat, icon:'╍', features:[['bump',12,0.47,0.56]]},
  trapOdd: {code:'K', name:'Odd dirt traps', length:15, shape:flat, icon:'⁙', features:[['trap',5,0.34,0.57]]},
  trapEven: {code:'L', name:'Even dirt traps', length:15, shape:flat, icon:'⁙', features:[['trap',10,0.34,0.57]]},
  coolFar: {code:'M', name:'Far coolant', length:17, shape:flat, icon:'»', features:[['cool',1,0.17,0.84]]},
  coolNear: {code:'N', name:'Near coolant', length:17, shape:flat, icon:'»', features:[['cool',4,0.17,0.84]]},
  roughNear: {code:'O', name:'Near rough patch', length:24, shape:flat, icon:'≋', features:[['rough',12,0.14,0.84]]},
  roughFar: {code:'P', name:'Far rough patch', length:24, shape:flat, icon:'≋', features:[['rough',3,0.14,0.84]]},
  roughAll: {code:'Q', name:'Full rough crossing', length:33, shape:[0,0,1.95,0.25,0,0,0], icon:'≋', features:[['rough',15,0.56,0.80]]},
  massif: {code:'R', name:'Compound hill', length:43, shape:[0,1.22,1.78,4.45,4.55,3.4,1.6,0], icon:'▴'},
  split: {code:'S', name:'Raised split route', length:46, shape:[0,0.35,2.3,3.3,3.4,2.3,0], icon:'⑂', lanes:3,
    features:[['trap',4,0.29,0.38],['trap',8,0.45,0.55],['cool',4,0.62,0.92]]},
} satisfies Record<string, PieceSpec>;
export type Piece = keyof typeof PIECES;
export const pieceSpec = (piece: Piece): PieceSpec => PIECES[piece];
export interface Course {
  id: string; name: string; theme: number; tagline: string; gold: number; layout: Piece[];
}
export const COURSES: Course[] = [
  {id:'clay', name:'Clay Circuit', theme:0, tagline:'Wheelies · Coolant lines', gold:13.2,
    layout:['bumpNear','rise','coolNear','bumpFar','hop','roughFar','tabletop','coolFar','trapOdd','trapEven','roughAll','double','bumpNear','straight']},
  {id:'quarry', name:'Quarry Drop', theme:1, tagline:'Long jumps · Steep landings', gold:15.25,
    layout:['lowdeck','launch','catch','coolFar','drop','crest','coolNear','massif','roughNear','steep','catch','double','trapOdd','straight']},
  {id:'fair', name:'Mud Fair', theme:2, tagline:'Wet ruts · Narrow clean lines', gold:15.8,
    layout:['mud','bumpNear','trapOdd','trapEven','coolFar','roughFar','roughNear','rollers','mud','roughAll','coolNear','bumpFar','rise','straight']},
  {id:'foundry', name:'Redline Foundry', theme:3, tagline:'Raised launch · Cooling slalom', gold:15.6,
    layout:['split','catch','trapOdd','trapEven','coolNear','split','lowdeck','roughNear','bumpFar','split','crest','coolFar','super','straight']},
  {id:'ridge', name:'White Ridge', theme:4, tagline:'Compound hills · Final slalom', gold:14.65,
    layout:['massif','coolFar','launch','catch','roughAll','bumpNear','super','crest','rise','coolNear','massif','trapOdd','trapEven','bumpFar','straight']},
];
export interface Segment { piece: Piece; x: number; end: number; index: number }
export class Track {
  readonly segments: Segment[] = [];
  readonly markers: number[] = [];
  end = 20;
  constructor(readonly course: Course, readonly laps = 1) {
    this.add('straight', 0, this.end, -1);
    for (let lap=0; lap<laps; lap++) {
      for (const [index, piece] of course.layout.entries()) {
        const end = this.end + PIECES[piece].length;
        this.add(piece, this.end, end, index);
        this.end = end;
      }
      this.markers.push(this.end);
      if (lap+1<laps) {
        this.add('straight',this.end,this.end+15,-1);
        this.end+=15;
      }
    }
    this.add('straight', this.end, this.end + 42, -1);
  }
  private add(piece: Piece, x: number, end: number, index: number) {
    this.segments.push({piece, x, end, index});
  }
  section(x: number) {
    let lo=0, hi=this.segments.length-1;
    while(lo<hi){
      const mid=(lo+hi)>>>1;
      if(x<this.segments[mid].end)hi=mid;else lo=mid+1;
    }
    return this.segments[lo];
  }
  boundaries(s: Segment) {
    const spec=pieceSpec(s.piece);
    const points=spec.shape.map((_,i)=>i/(spec.shape.length-1));
    for(const [kind,,from,to] of spec.features??[]) {
      points.push(from,to);
      if(kind==='bump') points.push(blend(from,to,0.28),blend(from,to,0.72));
    }
    if(s.piece==='cool'||s.piece==='mud')points.push(1.4/(s.end-s.x),1-1.4/(s.end-s.x));
    return points.map(t=>blend(s.x,s.end,t));
  }
  height(x: number, z: number) {
    const s=this.section(x), spec=pieceSpec(s.piece), t=clamp((x-s.x)/(s.end-s.x),0,1);
    const u=t*(spec.shape.length-1), i=Math.min(spec.shape.length-2,Math.floor(u));
    const profile=blend(spec.shape[i],spec.shape[i+1],u-i);
    const split=spec.lanes ? clamp((0.58-z)/1.16,0,1) : 1;
    const lane=clamp(Math.round((z-LANES[0])/2.4),0,3);
    let bump=0;
    for(const [kind,mask,from,to] of spec.features??[]) {
      if(kind==='bump' && (mask & (1<<lane)) && t>from && t<to){
        const edge=mask===3?clamp(-z/0.22,0,1):clamp(z/0.22,0,1);
        bump=0.24*edge*clamp(Math.min(t-from,to-t)/((to-from)*0.28),0,1);
      }
    }
    return profile*split+bump;
  }
  slope(x: number, z: number, wheelbase = 1.8) {
    return Math.atan2(this.height(x+wheelbase/2,z)-this.height(x-wheelbase/2,z),wheelbase);
  }
  surface(x: number, z: number): Surface {
    const s=this.section(x);
    const t=(x-s.x)/(s.end-s.x);
    const lane=clamp(Math.round((z-LANES[0])/2.4),0,3);
    for (const [kind,mask,from,to] of pieceSpec(s.piece).features??[]) {
      if(t>=from && t<to && (mask & (1<<lane))) return kind;
    }
    if (x<s.x+1.4||x>s.end-1.4) return 'dirt';
    if (s.piece==='cool' && lane===(s.index%2?0:3)) return 'cool';
    if (s.piece==='mud' && (lane===s.index%4 || lane===(s.index+1)%4 ||
      (this.course.theme===2 && lane===(s.index+2)%4))) return 'mud';
    return 'dirt';
  }
}
