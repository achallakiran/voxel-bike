import type {Race,CrowdKind} from './race';

// Offline vocal ensembles, applause and whistles. No network audio requests.
export class CrowdAudio {
  volume=0.7;
  activeUntil=0;
  private celebration=false;
  private bus:GainNode;
  private ambienceGain:GainNode;
  private buffers=new Map<string,AudioBuffer>();
  private serial=0;
  private next=0;
  constructor(private ctx:AudioContext){
    this.bus=ctx.createGain();this.bus.connect(ctx.destination);
    this.ambienceGain=ctx.createGain();this.ambienceGain.gain.value=0;this.ambienceGain.connect(this.bus);
    const bed=ctx.createBufferSource();bed.buffer=this.sample('ambient',0);bed.loop=true;bed.connect(this.ambienceGain);bed.start();
    // Prepare variants before racing to avoid synthesis work on a landing frame.
    for(const kind of ['gasp','landing','pass','lap','finish'])for(let i=0;i<2;i++)this.sample(kind,i);
  }
  reset(){this.serial=0;this.next=0;this.activeUntil=0;this.celebration=false;}
  private sample(kind:string,variant:number){
    const key=kind+variant,cached=this.buffers.get(key);if(cached)return cached;
    const ambient=kind==='ambient',gasp=kind==='gasp',big=kind==='finish'||kind==='lap';
    const duration=ambient?3.2:gasp?0.90:big?2.2:1.25,rate=22050;
    const buffer=this.ctx.createBuffer(2,Math.ceil(duration*rate),rate);
    let seed=9782+variant*734+kind.length*982;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const channels=[buffer.getChannelData(0),buffer.getChannelData(1)];
    // Individual voices use harmonic formants and staggered breath attacks.
    for(let voice=0;voice<(ambient?9:big?10:6);voice++){
      const start=ambient?random()*0.7:random()*0.16,length=ambient?1.2+random():duration-start-0.12;
      const f0=110+random()*150,pan=0.15+random()*0.7,phase=random()*6;
      const coeffs=Array.from({length:20},(_,h)=>{const hz=(h+1)*f0;return(0.15+Math.exp(-(((hz-(gasp?520:780))/220)**2))+0.65*Math.exp(-(((hz-(gasp?1050:1500))/350)**2)))/(h+1);});
      for(let i=Math.floor(start*rate);i<Math.min(buffer.length,(start+length)*rate);i++){
        const t=i/rate-start;if(t<0)continue;const u=Math.min(1,t/length);
        const envelope=Math.min(1,t/(gasp?0.12:0.08))*Math.pow(Math.sin(Math.PI*u),gasp?1.8:0.7);
        const pitch=f0*(gasp?1.05-0.23*u:1+0.16*Math.sin(u*Math.PI))+Math.sin(t*27+phase)*3;
        let vocal=0;for(let h=1;h<=20;h++)vocal+=Math.sin(2*Math.PI*h*pitch*t+phase)*coeffs[h-1];
        const breath=(random()*2-1)*(gasp?0.22:0.04);
        const value=(vocal*0.030+breath*0.055)*envelope;
        channels[0][i]+=value*(1-pan);channels[1][i]+=value*pan;
      }
    }
    if(!ambient&&!gasp){
      for(let clap=0;clap<(big?23:9);clap++){
        const start=Math.floor((0.10+random()*(duration-0.3))*rate),pan=random();
        for(let i=0;i<Math.min(1400,buffer.length-start);i++){const v=(random()*2-1)*Math.exp(-i/170)*0.25;channels[0][start+i]+=v*(1-pan);channels[1][start+i]+=v*pan;}
      }
      if(kind==='pass'||big){const start=Math.floor(rate*0.24);for(let i=0;i<rate*0.65&&start+i<buffer.length;i++){const t=i/rate,v=Math.sin(2*Math.PI*(2100*t+140*t*t))*Math.sin(Math.PI*t/0.65)*0.04;channels[variant][start+i]+=v;}}
    }
    // Ambient sample has a soft edge so its loop never clicks.
    if(ambient)for(let i=0;i<buffer.length;i++){const edge=Math.min(1,i/4000,(buffer.length-i)/4000);channels[0][i]*=edge;channels[1][i]*=edge;}
    let peak=0;for(const channel of channels)for(const value of channel)peak=Math.max(peak,Math.abs(value));
    if(peak>0.70)for(const channel of channels)for(let i=0;i<channel.length;i++)channel[i]*=0.70/peak;
    this.buffers.set(key,buffer);return buffer;
  }
  update(race:Race|undefined,enabled:boolean){
    const now=this.ctx.currentTime;this.bus.gain.setTargetAtTime(enabled&&(race||this.celebration&&now<this.activeUntil)?this.volume:0,now,0.035);
    const running=race&&race.time>=0&&!race.done;
    const spacing=race?.track.course.theme===0?24:40;
    const local=race?.track.local(race.rider.x)??0;
    const near=running?Math.max(0,1-Math.abs(((local-6+spacing/2)%spacing+spacing)%spacing-spacing/2)/18):0;
    this.ambienceGain.gain.setTargetAtTime(running?0.23*near:0,now,0.3);
    if(!race||!enabled)return;
    const events=race.crowd.filter(e=>e.serial>this.serial);if(!events.length)return;
    this.serial=events.at(-1)!.serial;
    const priorities:Record<CrowdKind,number>={finish:5,lap:4,gasp:3,landing:2,pass:1};
    const reaction=events.filter(e=>Math.abs(race.track.delta(e.x,race.rider.x))<38).sort((a,b)=>priorities[b.kind]-priorities[a.kind])[0];
    if(!reaction||now<this.next&&reaction.kind!=='finish'&&reaction.kind!=='gasp')return;
    const source=this.ctx.createBufferSource(),gain=this.ctx.createGain(),pan=this.ctx.createStereoPanner();
    source.buffer=this.sample(reaction.kind,reaction.serial%2);source.playbackRate.value=0.95+(reaction.serial%5)*0.025;
    gain.gain.value=(reaction.kind==='finish'?1.1:0.82)*Math.max(0.2,1-Math.abs(race.track.delta(reaction.x,race.rider.x))/48);
    pan.pan.value=Math.max(-0.65,Math.min(0.65,race.rider.z/7));source.connect(gain).connect(pan).connect(this.bus);source.start();
    source.onended=()=>{source.disconnect();gain.disconnect();pan.disconnect();};this.next=now+0.65;this.activeUntil=now+(reaction.kind==='finish'?2.2:1.2);this.celebration=reaction.kind==='finish';
  }
}
