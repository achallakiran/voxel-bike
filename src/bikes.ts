export const BIKE_CATALOG = [
  {id:'starter',name:'Trail 125',price:0,color:0xd32a3c,description:'Balanced · forgiving',speed:1,acceleration:1,cooling:1,suspension:1.12,grip:1.04,lift:1,agility:1,braking:1,voice:1,wheelbase:0.90},
  {id:'swift',name:'Swift 150',price:750,color:0xe8ad35,description:'Light · agile · stunt',speed:1.06,acceleration:1.27,cooling:0.97,suspension:1.24,grip:0.98,lift:1.22,agility:1.3,braking:1.05,voice:1.25,wheelbase:0.82},
  {id:'redline',name:'Redline 250',price:1250,color:0x72bbb6,description:'Competition · powerful',speed:1.19,acceleration:1.35,cooling:0.84,suspension:1.08,grip:1.10,lift:0.94,agility:1.05,braking:1.1,voice:0.85,wheelbase:0.97},
  {id:'cruiser',name:'Boulevard 900',price:1650,color:0x9264d9,description:'Cruiser · planted · heavy',speed:1.12,acceleration:0.88,cooling:1.25,suspension:0.94,grip:1.17,lift:0.76,agility:0.74,braking:0.93,voice:0.58,wheelbase:1.16},
  {id:'sport',name:'Apex 600',price:2000,color:0x4f8bef,description:'Sport · fast · precise',speed:1.29,acceleration:1.40,cooling:0.90,suspension:0.87,grip:1.23,lift:0.85,agility:1.12,braking:1.26,voice:1.6,wheelbase:1.02}
] as const;
export type BikeId=(typeof BIKE_CATALOG)[number]['id'];
export const UPGRADE_KEYS=['engine','cooling','suspension','tyres'] as const;
export type Upgrade=(typeof UPGRADE_KEYS)[number];
export type Levels=Record<Upgrade,number>;
export const PAINTS=[{name:'Scarlet',color:0xd32a3c},{name:'Gold',color:0xf2bd39},{name:'Lagoon',color:0x46c6b1},{name:'Cobalt',color:0x4f8bef},{name:'Violet',color:0x9960df},{name:'Pearl',color:0xeee5d9},{name:'Coral',color:0xf67d54},{name:'Rose',color:0xe97db7}] as const;
export interface Loadout {bike:BikeId; levels:Levels; paint?:number}
export const BASE_LOADOUT:Loadout={bike:'starter',levels:{engine:0,cooling:0,suspension:0,tyres:0}};
export const UPGRADE_PRICES=[150,300,500] as const;
export const UPGRADE_INFO:Record<Upgrade,{name:string;benefit:string;icon:string}>={
  engine:{name:'Engine',benefit:'Stronger launch · higher speed',icon:'⚙'},
  cooling:{name:'Cooling',benefit:'Longer turbo · faster cooling',icon:'❄'},
  suspension:{name:'Suspension',benefit:'Softer landings · less impact',icon:'↕'},
  tyres:{name:'Tyres',benefit:'More corner grip · wet control',icon:'◉'}
};
export function bikeDefinition(id:BikeId){return BIKE_CATALOG.find(b=>b.id===id)!;}
export function validLoadout(value:unknown):value is Loadout {
  if(!value||typeof value!=='object')return false;
  const v=value as Loadout;
  return BIKE_CATALOG.some(b=>b.id===v.bike)&&!!v.levels&&UPGRADE_KEYS.every(k=>Number.isInteger(v.levels[k])&&v.levels[k]>=0&&v.levels[k]<=3)&&
    (v.paint===undefined||PAINTS.some(p=>p.color===v.paint));
}
export function collectionUnlocked(owned:Partial<Record<BikeId,unknown>>,id:BikeId){return id!=='cruiser'&&id!=='sport'||['starter','swift','redline'].every(k=>!!owned[k as BikeId]);}
export function loadoutKey(loadout:Loadout){
  const levels=UPGRADE_KEYS.map(k=>loadout.levels[k]).join('');
  // v6 separates new handling from legacy ghosts. Cosmetic paint never changes a record key.
  return ':v6:'+loadout.bike+':'+levels;
}
export function bikeStats(loadout:Loadout){
  const base=bikeDefinition(loadout.bike),l=loadout.levels;
  return {...base,color:loadout.paint??base.color,speed:base.speed*(1+l.engine*0.045),acceleration:base.acceleration*(1+l.engine*0.12),
    cooling:base.cooling*(1+l.cooling*0.23),suspension:base.suspension*(1+l.suspension*0.17),
    grip:base.grip*(1+l.tyres*0.10),wetControl:1-l.tyres*0.18};
}
export type Difficulty='easy'|'medium'|'hard';
export const DIFFICULTIES:Record<Difficulty,{label:string;pace:number;decision:number;turbo:number;aim:number;reward:number}>={
  easy:{label:'Easy',pace:0.58,decision:83,turbo:0.86,aim:2.7,reward:1},
  medium:{label:'Medium',pace:0.76,decision:53,turbo:0.58,aim:3.7,reward:1.3},
  hard:{label:'Hard',pace:0.92,decision:37,turbo:0.30,aim:4.8,reward:1.6}
};
export function rivalLoadouts(difficulty:Difficulty):Loadout[]{
  const ids:BikeId[]=difficulty==='easy'?['starter','cruiser','swift']:difficulty==='medium'?['swift','redline','cruiser']:['redline','sport','swift'];
  return ids.map((bike,i)=>{const n=difficulty==='easy'?0:difficulty==='medium'?1:2+(i===0?1:0);return{bike,levels:{engine:n,cooling:n,suspension:n,tyres:n}};});
}
export function raceColors(loadout:Loadout):number[]{
  const player=bikeStats(loadout).color;
  const rgb=(c:number)=>[(c>>16)&255,(c>>8)&255,c&255];
  const distance=(a:number,b:number)=>Math.hypot(...rgb(a).map((v,i)=>v-rgb(b)[i]));
  let best:number[]=[player],score=-1;
  const choices=PAINTS.map(p=>p.color).filter(c=>distance(c,player)>135);
  for(let a=0;a<choices.length;a++)for(let b=a+1;b<choices.length;b++)for(let c=b+1;c<choices.length;c++){
    const colors=[player,choices[a],choices[b],choices[c]];
    const separation=Math.min(...colors.flatMap((color,i)=>colors.slice(i+1).map(other=>distance(color,other))));
    if(separation>score){score=separation;best=colors;}
  }
  return best;
}
