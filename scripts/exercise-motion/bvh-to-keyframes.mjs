#!/usr/bin/env node
// Spike tool for #901: turns a motion capture clip (BVH) into the small side-view
// keyframe file an in-app figure would be drawn from. Standalone, never shipped in the app.
//
//   node scripts/exercise-motion/bvh-to-keyframes.mjs <clip.bvh> --inspect
//       prints the hip height over time, to find a clean rep
//   node scripts/exercise-motion/bvh-to-keyframes.mjs <clip.bvh> --from <s> --to <s>
//       [--fps 15] [--smooth 2] [--name squat] [--out file.json] [--js file.js]
//
// Output: { name, fps, joints: [...], bones: [[a,b],...], frames: [[x0,y0,x1,y1,...], ...] }
// in a 0 to 1000 box (integers), y down, the lifter facing right.
// The source clip is never copied into the output; only joint positions are kept.

import fs from 'node:fs'

const args = process.argv.slice(2)
const file = args[0]
if (!file) {
  console.error('usage: bvh-to-keyframes.mjs <clip.bvh> [--inspect] [--from s --to s] [--fps 15] [--smooth 2] [--out f.json] [--js f.js]')
  process.exit(2)
}
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`)
  return i >= 0 ? args[i + 1] : d
}

// ---- parse ----
const text = fs.readFileSync(file, 'utf8')
const [head, motion] = text.split(/\nMOTION\s*\n/)
const tokens = head.split(/\s+/).filter(Boolean)
const joints = [] // { name, parent, offset, channels }
const stack = []
let i = 0
while (i < tokens.length) {
  const t = tokens[i]
  if (t === 'ROOT' || t === 'JOINT') {
    joints.push({ name: tokens[i + 1], parent: stack.length ? stack[stack.length - 1] : -1, offset: [0, 0, 0], channels: [] })
    i += 2
  } else if (t === 'End') {
    joints.push({ name: `${joints[stack[stack.length - 1]].name}_end`, parent: stack[stack.length - 1], offset: [0, 0, 0], channels: [], end: true })
    i += 2
  } else if (t === '{') {
    stack.push(joints.length - 1)
    i++
  } else if (t === '}') {
    stack.pop()
    i++
  } else if (t === 'OFFSET') {
    joints[stack[stack.length - 1]].offset = tokens.slice(i + 1, i + 4).map(Number)
    i += 4
  } else if (t === 'CHANNELS') {
    const n = Number(tokens[i + 1])
    joints[stack[stack.length - 1]].channels = tokens.slice(i + 2, i + 2 + n)
    i += 2 + n
  } else i++
}
const mlines = motion.trim().split('\n')
const frameTime = Number(mlines[1].split(':')[1])
const frames = mlines.slice(2).map((l) => l.trim().split(/\s+/).map(Number))

// ---- forward kinematics ----
const rot = (axis, deg) => {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r)
  if (axis === 'X') return [1, 0, 0, 0, c, -s, 0, s, c]
  if (axis === 'Y') return [c, 0, s, 0, 1, 0, -s, 0, c]
  return [c, -s, 0, s, c, 0, 0, 0, 1]
}
const mul = (a, b) => {
  const o = new Array(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  return o
}
const apply = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
const I = [1, 0, 0, 0, 1, 0, 0, 0, 1]

function pose(values) {
  const pos = [], R = []
  let k = 0
  joints.forEach((j, idx) => {
    let local = I, trans = j.offset
    for (const ch of j.channels) {
      const v = values[k++]
      if (ch.endsWith('position')) {
        trans = trans.slice()
        trans['XYZ'.indexOf(ch[0])] += v
      } else local = mul(local, rot(ch[0], v))
    }
    if (j.parent < 0) {
      pos[idx] = trans
      R[idx] = local
    } else {
      const p = apply(R[j.parent], trans)
      pos[idx] = [pos[j.parent][0] + p[0], pos[j.parent][1] + p[1], pos[j.parent][2] + p[2]]
      R[idx] = mul(R[j.parent], local)
    }
  })
  return pos
}
const J = (n) => {
  const x = joints.findIndex((j) => j.name === n)
  if (x < 0) throw new Error(`no joint ${n}`)
  return x
}

// ---- inspect ----
if (args.includes('--inspect')) {
  const hips = J('Hips')
  const step = Math.round(0.25 / frameTime)
  let line = ''
  frames.forEach((f, n) => {
    if (n % step) return
    const y = pose(f)[hips][1]
    line += `${(n * frameTime).toFixed(2).padStart(6)}s ${y.toFixed(1).padStart(6)} ${'#'.repeat(Math.max(0, Math.round(y - 5)))}\n`
  })
  process.stdout.write(`${frames.length} frames at ${(1 / frameTime).toFixed(0)} fps\n${line}`)
  process.exit(0)
}

// ---- extract one rep ----
const from = Number(opt('from', 0)), to = Number(opt('to', frames.length * frameTime))
const fps = Number(opt('fps', 15))
const smooth = Number(opt('smooth', 2))
const name = opt('name', 'clip')

// Joints the figure draws (far-side limbs kept so a style can draw them dimmer).
const KEEP = ['Head_end', 'Neck1', 'Spine1', 'Hips',
  'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase']
const idx = KEEP.map(J)
const BONES = [['Head_end', 'Neck1'], ['Neck1', 'Spine1'], ['Spine1', 'Hips'],
  ['Neck1', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'],
  ['Neck1', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'],
  ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['RightFoot', 'RightToeBase'],
  ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['LeftFoot', 'LeftToeBase']].map(([a, b]) => [KEEP.indexOf(a), KEEP.indexOf(b)])

const a = Math.round(from / frameTime), b = Math.min(frames.length - 1, Math.round(to / frameTime))
const every = Math.max(1, Math.round(1 / fps / frameTime))
let raw = []
for (let n = a; n <= b; n++) {
  const p = pose(frames[n])
  raw.push(idx.map((x) => p[x]))
}
// Smooth at the capture rate (moving average of 2*smooth+1 samples per output step) before thinning.
const win = smooth * every
raw = raw.map((_, n) => raw[0].map((__, j) => {
  const s = [0, 0, 0]
  let c = 0
  for (let m = Math.max(0, n - win); m <= Math.min(raw.length - 1, n + win); m++) {
    for (let d = 0; d < 3; d++) s[d] += raw[m][j][d]
    c++
  }
  return s.map((v) => v / c)
}))
const thin = raw.filter((_, n) => n % every === 0)

// Side view: project on the plane the lifter faces along, seen from the lifter's right side.
const L = KEEP.indexOf('LeftUpLeg'), Rr = KEEP.indexOf('RightUpLeg')
let fx = 0, fz = 0
for (const fr of thin) {
  const hx = fr[L][0] - fr[Rr][0], hz = fr[L][2] - fr[Rr][2]
  // Forward = hip axis (left to right) x up = (-hz, 0, hx), so the lifter faces +x (right on screen).
  fx += -hz
  fz += hx
}
const fl = Math.hypot(fx, fz)
fx /= fl
fz /= fl
const proj = thin.map((fr) => fr.map(([x, y, z]) => [x * fx + z * fz, -y]))

// Fit every frame into one 0..1000 box with the feet on a fixed floor line.
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
for (const fr of proj) for (const [x, y] of fr) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
}
const scale = 900 / Math.max(maxX - minX, maxY - minY)
const ox = 500 - ((minX + maxX) / 2) * scale, oy = 950 - maxY * scale
const out = {
  name,
  source: 'CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion by B. Hahne',
  fps,
  joints: KEEP,
  bones: BONES,
  frames: proj.map((fr) => fr.flatMap(([x, y]) => [Math.round(ox + x * scale), Math.round(oy + y * scale)])),
}
const json = JSON.stringify(out)
if (opt('out')) fs.writeFileSync(opt('out'), json + '\n')
if (opt('js')) fs.writeFileSync(opt('js'), `// Generated by scripts/exercise-motion/bvh-to-keyframes.mjs (#901). Data: ${out.source}.\nwindow.MOTION = window.MOTION || {};\nwindow.MOTION[${JSON.stringify(name)}] = ${json};\n`)
console.log(`${name}: ${out.frames.length} frames at ${fps} fps, ${KEEP.length} joints, ${json.length} bytes JSON, ${Math.round(json.length / 1024 * 10) / 10} KB`)
