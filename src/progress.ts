import {BASE_LOADOUT, BIKE_CATALOG, UPGRADE_KEYS, UPGRADE_PRICES, validLoadout, PAINTS, collectionUnlocked,
  type BikeId, type Levels, type Loadout, type Upgrade} from './bikes';

export interface Progress {
  version:1; credits:number; points:number; selected:BikeId;
  paints?:Partial<Record<BikeId,number>>; owned:Partial<Record<BikeId,Levels>>; paid:string[]; revision:number;
}
export interface StorageLike {getItem(key:string):string|null;setItem(key:string,value:string):void}
const KEY='voxel-bikes:v1:progress';
function initial():Progress {
  return {version:1,credits:0,points:0,selected:'starter',owned:{starter:{...BASE_LOADOUT.levels}},paid:[],revision:0};
}
function valid(value:unknown):value is Progress {
  if(!value||typeof value!=='object')return false;
  const p=value as Progress;
  return p.version===1&&Number.isSafeInteger(p.credits)&&p.credits>=0&&Number.isSafeInteger(p.points)&&p.points>=0&&
    Number.isSafeInteger(p.revision)&&p.revision>=0&&!!p.owned&&!!p.owned.starter&&
    BIKE_CATALOG.every(b=>!p.owned[b.id]||validLoadout({bike:b.id,levels:p.owned[b.id]}))&&
    BIKE_CATALOG.some(b=>b.id===p.selected&&p.owned[b.id])&&Array.isArray(p.paid)&&p.paid.length<=256&&
    p.paid.every(id=>typeof id==='string')&&(p.paints===undefined||!!p.paints&&typeof p.paints==='object'&&Object.entries(p.paints).every(([id,color])=>BIKE_CATALOG.some(b=>b.id===id)&&PAINTS.some(paint=>paint.color===color)));
}
export class ProgressStore {
  private memory=initial();
  private queue:Promise<unknown>=Promise.resolve();
  persistent=true;
  constructor(private readonly storage:StorageLike|undefined){
    this.read();
  }
  read():Progress {
    if(this.persistent){
      try{
        const raw=this.storage?.getItem(KEY);
        if(!this.storage)throw Error('Storage unavailable');
        if(raw){const p:unknown=JSON.parse(raw);if(valid(p))this.memory=p;else this.persistent=false;}
      }catch{this.persistent=false;}
    }
    return structuredClone(this.memory);
  }
  loadout():Loadout {
    const p=this.read();return {bike:p.selected,levels:{...p.owned[p.selected]!},paint:p.paints?.[p.selected]};
  }
  private mutate(change:(p:Progress)=>string):Promise<string> {
    const operation=()=>{
      const p=this.read(),message=change(p);
      if(message)return message;
      p.revision++;
      if(this.persistent){
        try{this.storage!.setItem(KEY,JSON.stringify(p));}
        catch{this.persistent=false;}
      }
      this.memory=p;
      return this.persistent?'Saved':'Available this session · browser save unavailable';
    };
    const run=()=>{
      if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request(KEY,operation);
      return Promise.resolve(operation());
    };
    const result=this.queue.then(run,run);
    this.queue=result.catch(()=>{});
    return result;
  }
  select(id:BikeId){
    return this.mutate(p=>{if(!p.owned[id])return 'Buy this bike first';p.selected=id;return '';});
  }
  buy(id:BikeId){
    return this.mutate(p=>{
      const bike=BIKE_CATALOG.find(b=>b.id===id);
      if(!bike)return 'Unknown bike';
      if(p.owned[id])return 'Already owned';
      if(!collectionUnlocked(p.owned,id))return 'Own Trail, Swift and Redline to unlock';
      if(p.credits<bike.price)return 'Not enough credits';
      p.credits-=bike.price;p.owned[id]={...BASE_LOADOUT.levels};p.selected=id;return '';
    });
  }
  paint(id:BikeId,color:number){
    return this.mutate(p=>{if(!p.owned[id]||!PAINTS.some(paint=>paint.color===color))return 'Select an owned bike';
      p.paints??={};p.paints[id]=color;return '';});
  }
  upgrade(id:BikeId,key:Upgrade){
    return this.mutate(p=>{
      if(!UPGRADE_KEYS.includes(key)||!p.owned[id])return 'Select an owned bike';
      const levels=p.owned[id]!,level=levels[key];
      if(level>=3)return 'Fully upgraded';
      const price=UPGRADE_PRICES[level];
      if(p.credits<price)return 'Not enough credits';
      p.credits-=price;levels[key]++;return '';
    });
  }
  reward(id:string,credits:number,points:number){
    return this.mutate(p=>{
      if(p.paid.includes(id))return 'Reward already collected';
      if(!Number.isSafeInteger(credits)||!Number.isSafeInteger(points)||credits<0||points<0)return 'Invalid reward';
      if(!Number.isSafeInteger(p.credits+credits)||!Number.isSafeInteger(p.points+points))return 'Wallet limit reached';
      p.credits+=credits;p.points+=points;p.paid.push(id);p.paid=p.paid.slice(-256);return '';
    });
  }
}
