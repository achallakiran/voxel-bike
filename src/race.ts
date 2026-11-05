export const LANES = [-3.6, -1.2, 1.2, 3.6];
export const WIDTH = 9.6;
export const DT = 1 / 120;
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const blend = (a: number, b: number, t: number) => a + (b - a) * t;
export type Piece = 'straight' | 'tabletop' | 'rollers' | 'double' | 'mud' | 'cool' | 'drop';
export const PIECES: Record<Piece, { name: string; length: number; shape: number[]; icon: string }> = {
  straight: { name: 'Straight', length: 28, shape: [0, 0], icon: '━' },
  tabletop: { name: 'Tabletop', length: 40, shape: [0, 0, 2.8, 2.8, 2.6, 0, 0], icon: '⏢' },
  rollers: { name: 'Rollers', length: 30, shape: [0, 0.75, 0, 1.05, 0, 0.62, 0], icon: '∿' },
  double: { name: 'Double', length: 38, shape: [0, 0, 2.45, 0.18, 1.8, 0, 0], icon: '⋀⋀' },
  mud: { name: 'Mud', length: 32, shape: [0, 0], icon: '≋' },
  cool: { name: 'Cooling strip', length: 29, shape: [0, 0], icon: '»' },
  drop: { name: 'Step-down', length: 46, shape: [0, 0.2, 3.9, 3.7, 0.8, 0, 0], icon: '◿' },
};
export interface Course {
  id: string;
  name: string;
  theme: number;
  tagline: string;
  gold: number;
  layout: Piece[];
}
export const COURSES: Course[] = [
  { id:'clay', name:'Clay Circuit', theme:0, tagline:'Warm clay · Wide landings', gold:22,
    layout:['tabletop','cool','rollers','mud','tabletop','straight','double','cool','rollers','tabletop','mud','double','cool','tabletop','rollers','straight'] },
  { id:'quarry', name:'Quarry Drop', theme:1, tagline:'Long jumps · Steep landings', gold:25,
    layout:['drop','cool','double','rollers','drop','straight','mud','double','cool','drop','tabletop','rollers','cool','double','drop','straight'] },
  { id:'fair', name:'Mud Fair', theme:2, tagline:'Wet ruts · Narrow clean lines', gold:26,
    layout:['mud','rollers','cool','tabletop','mud','double','mud','cool','rollers','drop','mud','tabletop','cool','double','mud','straight'] },
];
export interface Segment { piece: Piece; x: number; end: number; index: number }
export class Track {
  segments: Segment[] = [];
  end = 34;
  constructor(readonly course: Course) {
    this.add('straight', 0, this.end, -1);
    course.layout.forEach((piece, i) => {
      const end = this.end + PIECES[piece].length;
      this.add(piece, this.end, end, i);
      this.end = end;
    });
    this.add('straight', this.end, this.end + 42, -1);
  }
  private add(piece: Piece, x: number, end: number, index: number) {
    this.segments.push({piece, x, end, index});
  }
  section(x: number) {
    return this.segments.find(s => x >= s.x && x < s.end) ?? this.segments[x < 0 ? 0 : this.segments.length - 1];
  }
  height(x: number, z: number) {
    const s = this.section(x);
    const shape = PIECES[s.piece].shape;
    const u = clamp((x - s.x) / (s.end - s.x), 0, 1) * (shape.length - 1);
    const i = Math.min(shape.length - 2, Math.floor(u));
    const h = blend(shape[i], shape[i + 1], u - i);
    return h * (0.91 + 0.09 * Math.cos((z + (s.index % 2 ? 1.5 : -1.5)) * 0.47));
  }
  slope(x: number, z: number, wheelbase = 1.6) {
    return Math.atan2(this.height(x + wheelbase / 2, z) - this.height(x - wheelbase / 2, z), wheelbase);
  }
  laneSurface(s: Segment, lane: number) {
    if (s.piece === 'cool' && lane === (s.index % 2 ? 0 : 3)) return 'cool';
    if (s.piece === 'mud' && (lane === s.index % 4 || lane === (s.index + 1) % 4 ||
      (this.course.theme === 2 && lane === (s.index + 2) % 4))) return 'mud';
    return 'dirt';
  }
  surface(x: number, z: number) {
    const s = this.section(x);
    if (x < s.x + 1.4 || x > s.end - 1.4) return 'dirt';
    return this.laneSurface(s, clamp(Math.round((z - LANES[0]) / 2.4), 0, 3));
  }
}
export interface Controls { gas: boolean; turbo: boolean; pitch: number }
export type Mode = 'trial' | 'rival' | 'test';
export type Feedback = 'Clean landing' | 'Rough landing' | 'Wipeout' | 'Overheated' | 'Cooling' | 'Contact';
export interface Bike {
  x: number; y: number; z: number; vy: number; speed: number; lane: number; pitch: number;
  heat: number; hot: boolean; air: boolean; crash: number; impact: number; spin: number;
  finish: number; recovering: number;
}
export type Frame = [number, number, number, number, number, number];
export interface RecordRun { time: number; frames: Frame[] }
function newBike(x: number, lane: number): Bike {
  return {x, y:0.72, z:LANES[lane], vy:0, speed:0, lane, pitch:0, heat:0, hot:false, air:false,
    crash:0, impact:0, spin:0, finish:0, recovering:0};
}
export class Race {
  rider: Bike;
  rivals: Bike[];
  time = -2.8;
  tick = 0;
  feedback: Feedback | null = null;
  feedbackTime = 0;
  record: Frame[] = [];
  done = false;
  readonly inputs = {gas:false, turbo:false, pitch:0};
  constructor(readonly track: Track, readonly mode: Mode, readonly ghost: RecordRun | undefined) {
    this.rider = newBike(5, 2);
    this.rivals = mode === 'rival' ? [newBike(7,0), newBike(6.5,1), newBike(7,3)] : [];
  }
  get position() { return 1 + this.rivals.filter(r => this.rider.finish ?
    r.finish > 0 && r.finish < this.rider.finish : r.x > this.rider.x).length; }
  moveLane(dir: number) {
    if (this.done || this.rider.crash > 0) return;
    this.rider.lane = clamp(this.rider.lane + dir, 0, 3);
  }
  private signal(event: Feedback) { this.feedback = event; this.feedbackTime = event === 'Overheated' ? 1.65 : 0.85; }
  step(dt: number) {
    if (this.done) return;
    this.time += dt;
    this.feedbackTime = Math.max(0, this.feedbackTime - dt);
    if (this.time < 0) return;
    this.drive(this.rider, this.inputs, dt, true);
    for (const [i, bike] of this.rivals.entries()) this.drive(bike, this.rivalInput(bike, i), dt, false);
    for (const rival of this.rivals) {
      const p = this.rider;
      if (p.crash || rival.crash || p.recovering || rival.recovering || p.finish || rival.finish) continue;
      if (Math.abs(p.x - rival.x) < 1.65 && Math.abs(p.z - rival.z) < 0.8 && Math.abs(p.y - rival.y) < 1) {
        const trailing = p.x < rival.x ? p : rival;
        trailing.speed *= 0.54;
        trailing.recovering = 0.75;
        trailing.impact = 1;
        if (trailing === p) this.signal('Contact');
      }
    }
    if (this.tick++ % 6 === 0 && this.mode === 'trial') {
      const {x,y,z,pitch,spin} = this.rider;
      this.record.push([this.time,x,y,z,pitch,spin].map(n=>+n.toFixed(3)) as Frame);
    }
    if (this.rider.finish) this.done = true;
  }
  private rivalInput(b: Bike, i: number): Controls {
    if (!b.air && this.tick % 34 === (i * 9)) {
      const ahead = this.track.surface(b.x + 9, LANES[b.lane]);
      const candidates = [b.lane, b.lane - 1, b.lane + 1].filter(lane => lane >= 0 && lane < 4);
      const options = candidates.filter(lane => ![this.rider, ...this.rivals].some(other =>
        other !== b && Math.abs(other.x - b.x) < 7 && other.lane === lane));
      if (ahead === 'mud' || b.heat > 54 || (Math.floor(b.x / 53) + i) % 4 === 0) {
        const lane = options.find(lane => {
          const surface = this.track.surface(b.x + 9, LANES[lane]);
          return b.heat > 54 ? surface === 'cool' : surface !== 'mud' && lane !== b.lane;
        });
        if (lane !== undefined) b.lane = lane;
      }
    }
    const target = this.track.slope(b.x + Math.max(1, b.speed * 0.15), b.z);
    return { gas: true, turbo: !b.hot && b.heat < 77 && Math.sin(this.time * (1.25 + i * 0.16) + i * 3) > 0.27,
      pitch: b.air ? clamp((target - b.pitch) * 4.5, -1, 1) : 0 };
  }
  private drive(b: Bike, input: Controls, dt: number, player: boolean) {
    if (b.finish) return;
    b.impact = Math.max(0, b.impact - dt * 3.6);
    b.recovering = Math.max(0, b.recovering - dt);
    if (b.crash > 0) {
      b.crash = Math.max(0, b.crash - dt);
      b.x += b.speed * dt;
      b.speed = Math.max(0, b.speed - 18 * dt);
      b.y = this.track.height(b.x,b.z) + 0.72;
      b.heat = Math.max(0,b.heat - 20 * dt);
      if (!b.crash) { b.recovering = 0.8; b.pitch = this.track.slope(b.x,b.z); }
      return;
    }
    const ground = this.track.surface(b.x, b.z);
    const cooling = !b.air && ground === 'cool';
    const muddy = !b.air && ground === 'mud';
    const turbo = input.turbo && !b.hot;
    const oldHeat = b.heat;
    b.heat = clamp(b.heat + (cooling ? -88 : turbo ? 28 : b.hot ? -49 : -17) * dt, 0, 100);
    if (cooling && oldHeat > 24 && player && this.feedback !== 'Cooling') this.signal('Cooling');
    if (b.heat >= 100 && !b.hot) { b.hot = true; if (player) this.signal('Overheated'); }
    if (b.hot && b.heat < 28) b.hot = false;
    const limit = (b.hot ? 13 : turbo ? 32 : 23) * (muddy ? 0.58 : 1);
    if (!b.air) {
      const accelerating = input.gas || input.turbo;
      const force = b.speed > limit ? (muddy ? -25 : -12) : accelerating ? (b.hot ? 7 : turbo ? 19 : 12.8) : -8.5;
      b.speed = clamp(b.speed + force * dt, 0, 33);
    }
    const oldX = b.x, oldZ = b.z;
    const lateralRate = b.air ? 1.8 : muddy ? 4.6 : 10.4;
    if (b.speed > 0.6) b.z += clamp(LANES[b.lane] - b.z, -lateralRate * dt, lateralRate * dt);
    b.x += b.speed * dt;
    b.spin -= b.speed * dt / 0.54;
    const floor = this.track.height(b.x, b.z) + 0.72;
    const angle = this.track.slope(b.x, b.z);
    if (!b.air) {
      const prevSlope = this.track.slope(oldX, oldZ, 0.38);
      const nextSlope = this.track.slope(b.x + 0.58, b.z, 0.38);
      if (prevSlope > 0.12 && prevSlope - nextSlope > 0.14 && b.speed > 8) {
        b.air = true;
        b.vy = Math.min(12, Math.tan(prevSlope) * b.speed * 0.87 + Math.max(0, input.pitch) * 0.65);
        b.y = Math.max(floor, b.y) + 0.018;
      } else {
        b.y = floor;
      }
      b.pitch = blend(b.pitch, angle + Math.max(0, input.pitch) * (b.speed > 5 ? 0.2 : 0), Math.min(1, dt * 15));
    } else {
      b.vy -= 20 * dt;
      b.y += b.vy * dt;
      const assist = this.track.slope(b.x + b.speed * 0.12, b.z) * 0.32;
      b.pitch = clamp(b.pitch + (input.pitch * 1.85 + (assist - b.pitch) * 0.78) * dt, -1.16, 1.16);
      if (b.y <= floor && b.vy <= Math.tan(angle) * b.speed) {
        const error = Math.abs(b.pitch - angle);
        b.y = floor;
        b.air = false;
        b.impact = Math.min(1, 0.28 + Math.abs(b.vy) * 0.068);
        if (error > 0.85) {
          b.crash = 1.04;
          b.speed *= 0.34;
          if (player) this.signal('Wipeout');
        } else if (error > 0.37) {
          b.speed *= 0.78;
          if (player) this.signal('Rough landing');
        } else if (player && b.vy < -3.2) {
          this.signal('Clean landing');
        }
        b.pitch = angle;
      }
    }
    if (b.x >= this.track.end) {
      b.finish = this.time - dt * (b.x - this.track.end) / Math.max(0.1, b.x - oldX);
    }
  }
}
