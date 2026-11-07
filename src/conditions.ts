import {clamp, type Surface, type Track} from './tracks';

export const DAYLIGHTS = ['Morning','Noon','Evening','Night'] as const;
export const WEATHER = ['Clear','Rain','Thunderstorm'] as const;
export type Conditions = { light: (typeof DAYLIGHTS)[number]; weather: (typeof WEATHER)[number] };
export const DEFAULT_CONDITIONS: Conditions = {light:'Noon',weather:'Clear'};

export type ConditionChoice={light:Conditions['light']|'Random';weather:Conditions['weather']|'Random'};
export function resolveConditions(choice:ConditionChoice,random= Math.random):Conditions {
  const draw=<T>(values:readonly T[])=>values[Math.min(values.length-1,Math.max(0,Math.floor(random()*values.length)))];
  return {light:choice.light==='Random'?draw(DAYLIGHTS):choice.light,
    weather:choice.weather==='Random'?draw(WEATHER):choice.weather};
}

export function conditionKey(conditions:Conditions) {
  return conditions.light==='Noon'&&conditions.weather==='Clear'
    ? '' : ':'+conditions.light.toLowerCase()+':'+conditions.weather.toLowerCase();
}

export function wetness(track:Track,conditions:Conditions,x:number,z:number,surface:Surface) {
  if(conditions.weather==='Clear'||surface==='bump'||surface==='cool')return 0;
  const wet=conditions.weather==='Rain'?0.55:0.83;
  if(surface==='mud'||surface==='trap')return Math.min(1,wet+0.24);
  const phase=track.local(x)/track.lapLength*2*Math.PI;
  const hollow=Math.max(0,-Math.sin(phase*7+z*0.42))*Math.max(0,-Math.sin(phase*3));
  return clamp(wet*(0.66+hollow*0.43),0,1);
}
