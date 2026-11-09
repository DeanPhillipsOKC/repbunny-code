// #901 spike: draws a lifter figure from side-view keyframes (scripts/exercise-motion/bvh-to-keyframes.mjs).
// Plain SVG, theme colors from CSS variables, no libraries. Not app code; a prototype for the design pages.
//
//   const fig = createFigure(svgElement, window.MOTION.squat, 'line' | 'solid' | 'bunny')
//   fig.play() / fig.pause() / fig.seek(0..1) / fig.stats()
(function () {
  const NS = 'http://www.w3.org/2000/svg'
  const el = (name, attrs, parent) => {
    const e = document.createElementNS(NS, name)
    for (const k in attrs) e.setAttribute(k, attrs[k])
    if (parent) parent.appendChild(e)
    return e
  }

  // Which bones belong to the far side (drawn first, dimmer) and which to the near side.
  const side = (joints, a, b) => {
    const n = joints[b]
    if (n.startsWith('Left')) return 'far'
    if (n.startsWith('Right')) return 'near'
    return 'trunk'
  }

  const STYLES = {
    // A: plain line figure in theme colors.
    line: { width: { far: 34, near: 40, trunk: 46 }, color: { far: 'var(--fig-far)', near: 'var(--fig-near)', trunk: 'var(--fig-near)' }, head: 58, ears: false, shadow: false },
    // B: chunky capsule figure, two-tone, with a floor shadow.
    solid: { width: { far: 62, near: 70, trunk: 96 }, color: { far: 'var(--fig-far-solid)', near: 'var(--fig-near-solid)', trunk: 'var(--fig-near-solid)' }, head: 66, ears: false, shadow: true },
    // C: line figure with bunny ears on the head.
    bunny: { width: { far: 34, near: 40, trunk: 46 }, color: { far: 'var(--fig-far)', near: 'var(--fig-near)', trunk: 'var(--fig-near)' }, head: 60, ears: true, shadow: false },
  }

  function createFigure(svg, motion, styleName) {
    const style = STYLES[styleName] || STYLES.line
    // Frame the whole rep (every frame's joints plus room for the head), floor at the bottom.
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity
    for (const f of motion.frames) for (let k = 0; k < f.length; k += 2) {
      x0 = Math.min(x0, f[k]); x1 = Math.max(x1, f[k]); y0 = Math.min(y0, f[k + 1])
    }
    const pad = 110, top = y0 - pad, h = 990 - top, w = Math.max(x1 - x0 + 2 * pad, h * 1.2)
    svg.setAttribute('viewBox', `${(x0 + x1) / 2 - w / 2} ${top} ${w} ${h}`)
    svg.innerHTML = ''
    const j = Object.fromEntries(motion.joints.map((n, i) => [n, i]))
    el('line', { x1: 60, y1: 962, x2: 940, y2: 962, stroke: 'var(--fig-floor)', 'stroke-width': 8, 'stroke-linecap': 'round' }, svg)
    const shadow = style.shadow ? el('ellipse', { cx: 500, cy: 962, rx: 150, ry: 16, fill: 'var(--fig-floor)' }, svg) : null
    const order = ['far', 'trunk', 'near']
    const bones = order.flatMap((s) => motion.bones.filter(([a, b]) => side(motion.joints, a, b) === s).map(([a, b]) => ({ a, b, s })))
    // Far side first; the head after the trunk so it sits on top of the neck.
    const lines = bones.map(({ a, b, s }) => el('line', { stroke: style.color[s], 'stroke-width': style.width[s], 'stroke-linecap': 'round' }, svg))
    const earL = style.ears ? el('ellipse', { fill: 'var(--fig-far)', rx: 20, ry: 58 }, svg) : null
    const earR = style.ears ? el('ellipse', { fill: 'var(--fig-near)', rx: 22, ry: 62 }, svg) : null
    const head = el('circle', { r: style.head, fill: 'var(--fig-near)' }, svg)
    if (styleName === 'solid') head.setAttribute('fill', 'var(--fig-near-solid)')

    const F = motion.frames, n = F.length
    const hold = 0.45 // seconds standing between reps
    const repSecs = (n - 1) / motion.fps
    const blend = 0.25 // seconds to ease the last frame back into the first
    const cycle = repSecs + blend + hold
    let t = 0, playing = false, last = 0, raf = 0, drawMs = 0, draws = 0

    const lerp = (fa, fb, u) => fa.map((v, k) => v + (fb[k] - v) * u)
    function frameAt(time) {
      const tt = ((time % cycle) + cycle) % cycle
      if (tt < hold) return F[0]
      const r = tt - hold
      if (r >= repSecs) {
        const u = (r - repSecs) / blend
        return lerp(F[n - 1], F[0], u * u * (3 - 2 * u))
      }
      const x = r * motion.fps, k = Math.floor(x)
      return k >= n - 1 ? F[n - 1] : lerp(F[k], F[k + 1], x - k)
    }
    function draw(f) {
      const s = performance.now()
      const P = (i) => [f[i * 2], f[i * 2 + 1]]
      bones.forEach(({ a, b }, i) => {
        const [x1, y1] = P(a), [x2, y2] = P(b)
        const l = lines[i]
        l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2)
      })
      // Head sits just past the neck, along the neck-to-head direction.
      const [nx, ny] = P(j.Neck1), [hx, hy] = P(j.Head_end)
      const dx = hx - nx, dy = hy - ny, d = Math.hypot(dx, dy) || 1
      const cx = nx + (dx / d) * (style.head + 30), cy = ny + (dy / d) * (style.head + 30)
      head.setAttribute('cx', cx); head.setAttribute('cy', cy)
      if (earL) {
        const ang = (Math.atan2(dy, dx) * 180) / Math.PI + 90
        const ex = cx + (dx / d) * (style.head + 40), ey = cy + (dy / d) * (style.head + 40)
        earL.setAttribute('cx', ex - 18); earL.setAttribute('cy', ey); earL.setAttribute('transform', `rotate(${ang - 14} ${ex - 18} ${ey})`)
        earR.setAttribute('cx', ex + 18); earR.setAttribute('cy', ey); earR.setAttribute('transform', `rotate(${ang + 12} ${ex + 18} ${ey})`)
      }
      if (shadow) {
        const fx = (f[j.RightToeBase * 2] + f[j.RightFoot * 2]) / 2
        shadow.setAttribute('cx', fx - 30)
      }
      drawMs += performance.now() - s
      draws++
    }
    function tick(now) {
      if (!playing) return
      t += (now - last) / 1000
      last = now
      draw(frameAt(t))
      raf = requestAnimationFrame(tick)
    }
    draw(F[0])
    return {
      play() { if (playing) return; playing = true; last = performance.now(); raf = requestAnimationFrame(tick) },
      pause() { playing = false; cancelAnimationFrame(raf) },
      seek(u) { t = hold + u * repSecs; draw(frameAt(t)) },
      get playing() { return playing },
      stats() { return { draws, msPerDraw: draws ? drawMs / draws : 0 } },
    }
  }
  window.createFigure = createFigure
})()
