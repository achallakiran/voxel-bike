export const BIKE_CATALOG = [
  {id:'starter',name:'Trail 125',price:0,color:0xd32a3c,description:'Balanced handling · forgiving starter',
    speed:1,acceleration:1,cooling:1,suspension:1,grip:1,lift:1},
  {id:'swift',name:'Swift 150',price:750,color:0xe8ad35,description:'Light stunt bike · quick lift and acceleration',
    speed:1.015,acceleration:1.12,cooling:0.97,suspension:1.12,grip:0.98,lift:1.10},
  {id:'redline',name:'Redline 250',price:1250,color:0x72bbb6,description:'Fast racer · stronger engine, more heat',
    speed:1.11,acceleration:1.16,cooling:0.88,suspension:0.98,grip:1.05,lift:0.96}
] as const;
export type BikeId=(typeof BIKE_CATALOG)[number]['id'];
export const UPGRADE_KEYS=['engine','cooling','suspension','tyres'] as const;
export type Upgrade=(typeof UPGRADE_KEYS)[number];
export type Levels=Record<Upgrade,number>;
export interface Loadout {bike:BikeId; levels:Levels}
export const BASE_LOADOUT:Loadout={bike:'starter',levels:{engine:0,cooling:0,suspension:0,tyres:0}};
export const UPGRADE_PRICES=[150,300,500] as const;
export const UPGRADE_INFO:Record<Upgrade,{name:string;benefit:string}>={
  engine:{name:'Engine',benefit:'Quicker acceleration and higher top speed'},
  cooling:{name:'Cooling',benefit:'Slower heat buildup and faster cooling'},
  suspension:{name:'Suspension',benefit:'Softer rough landings and faster recovery'},
  tyres:{name:'Tyres',benefit:'More corner grip and better wet handling'}
};
export function bikeDefinition(id:BikeId){return BIKE_CATALOG.find(b=>b.id===id)!;}
export function validLoadout(value:unknown):value is Loadout {
  if(!value||typeof value!=='object')return false;
  const v=value as Loadout;
  return BIKE_CATALOG.some(b=>b.id===v.bike)&&!!v.levels&&UPGRADE_KEYS.every(k=>
    Number.isInteger(v.levels[k])&&v.levels[k]>=0&&v.levels[k]<=3);
}
export function loadoutKey(loadout:Loadout){
  const levels=UPGRADE_KEYS.map(k=>loadout.levels[k]).join('');
  return loadout.bike==='starter'&&levels==='0000'?'':':'+loadout.bike+':'+levels;
}
export function bikeStats(loadout:Loadout){
  const base=bikeDefinition(loadout.bike),l=loadout.levels;
  return {...base,speed:base.speed*(1+l.engine*0.025),acceleration:base.acceleration*(1+l.engine*0.07),
    cooling:base.cooling*(1+l.cooling*0.15),suspension:base.suspension*(1+l.suspension*0.10),
    grip:base.grip*(1+l.tyres*0.065),wetControl:1-l.tyres*0.12};
}
export type Difficulty='easy'|'medium'|'hard';
export const DIFFICULTIES:Record<Difficulty,{label:string;pace:number;decision:number;turbo:number;aim:number;reward:number}>={
  easy:{label:'Easy',pace:0.62,decision:83,turbo:0.86,aim:2.7,reward:1},
  medium:{label:'Medium',pace:0.82,decision:53,turbo:0.58,aim:3.7,reward:1.3},
  hard:{label:'Hard',pace:1,decision:37,turbo:0.30,aim:4.8,reward:1.6}
};

export function raceColors(loadout:Loadout):number[] {
  const player=bikeDefinition(loadout.bike).color;
  const rivals=loadout.bike==='swift'?[0x528cff,0xbc75f0,0x55d3bd]:
    loadout.bike==='redline'?[0x528cff,0xf8c84b,0xed79ae]:[0x528cff,0xf8c84b,0x55d3bd];
  return [player,...rivals];
}
