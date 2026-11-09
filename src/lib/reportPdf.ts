// Issue #152: lays a CoachReport (lib/coachReport.ts) out as a printable PDF,
// on the device. jsPDF rather than a print stylesheet: window.print() does
// nothing in the Android WebView and can't hand a file to the share sheet,
// while jsPDF is plain JS that runs the same in a browser and the Capacitor
// apps with no server (the native app is local-only). It's imported only
// when a report is shared, so it stays out of the main bundle. Text is drawn
// with the built-in Helvetica (no font file to embed) and left uncompressed,
// which keeps the file small and its text searchable.
import type { CoachReport } from './coachReport'
import { e1rmChange, rangeLabel } from './coachReport'
import { MUSCLE_GROUP_LABELS } from './muscleGroups'
import { formatSets } from './muscleVolume'

type Rgb = [number, number, number]

// Light layout whatever the app theme, so it prints well.
const INK: Rgb = [36, 26, 44]
const DIM: Rgb = [110, 98, 118]
const RULE: Rgb = [226, 220, 230]
const ACCENT: Rgb = [214, 84, 116]
const BAND: Rgb = [248, 244, 247]

const PAGE_W = 612
const PAGE_H = 792
const MARGIN = 48
const BOTTOM = PAGE_H - 64
const LINE = 13

interface Column {
  header: string
  x: number
  width: number
  align?: 'left' | 'right'
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function n(v: number): string {
  return v.toLocaleString('en-US')
}

export async function renderReportPdf(report: CoachReport, generatedAt: Date = new Date()): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: false })
  doc.setProperties({ title: `Training report, ${rangeLabel(report.range)}`, creator: 'RepBunny' })
  let y = MARGIN

  const color = (c: Rgb) => doc.setTextColor(c[0], c[1], c[2])
  const font = (style: 'normal' | 'bold', size: number, c: Rgb = INK) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(size)
    color(c)
  }
  const rule = (at: number, c: Rgb = RULE, width = 0.75) => {
    doc.setDrawColor(c[0], c[1], c[2])
    doc.setLineWidth(width)
    doc.line(MARGIN, at, PAGE_W - MARGIN, at)
  }
  const ensure = (height: number): boolean => {
    if (y + height <= BOTTOM) return false
    doc.addPage()
    y = MARGIN
    return true
  }

  const heading = (text: string) => {
    ensure(48)
    y += 14
    font('bold', 13)
    doc.text(text, MARGIN, y)
    y += 8
    rule(y, ACCENT, 1.25)
    y += 14
  }

  const note = (text: string) => {
    font('normal', 8.5, DIM)
    const lines = doc.splitTextToSize(text, PAGE_W - MARGIN * 2) as string[]
    ensure(lines.length * 11)
    doc.text(lines, MARGIN, y)
    y += lines.length * 11
  }

  const table = (columns: Column[], rows: string[][]) => {
    const drawHeader = () => {
      font('bold', 8, DIM)
      for (const c of columns) {
        doc.text(c.header.toUpperCase(), c.align === 'right' ? c.x + c.width : c.x, y, { align: c.align ?? 'left' })
      }
      y += 6
      rule(y)
      y += LINE
    }
    ensure(LINE * 3)
    drawHeader()
    rows.forEach((row, i) => {
      // The first column is bold, so measure each cell in its own font.
      const cells = row.map((text, c) => {
        font(c === 0 ? 'bold' : 'normal', 10)
        return doc.splitTextToSize(text, columns[c].width) as string[]
      })
      const height = Math.max(...cells.map((l) => l.length)) * LINE
      if (ensure(height + 4)) drawHeader()
      if (i % 2 === 1) {
        doc.setFillColor(BAND[0], BAND[1], BAND[2])
        doc.rect(MARGIN, y - LINE + 3, PAGE_W - MARGIN * 2, height, 'F')
      }
      cells.forEach((lines, c) => {
        const col = columns[c]
        font(c === 0 ? 'bold' : 'normal', 10)
        doc.text(lines, col.align === 'right' ? col.x + col.width : col.x, y, { align: col.align ?? 'left' })
      })
      y += height
    })
    y += 4
  }

  // Title block.
  font('bold', 22)
  doc.text('Training report', MARGIN, y + 10)
  y += 30
  font('normal', 11, DIM)
  doc.text(rangeLabel(report.range), MARGIN, y)
  y += 22

  // Summary band.
  doc.setFillColor(BAND[0], BAND[1], BAND[2])
  doc.roundedRect(MARGIN, y, PAGE_W - MARGIN * 2, 54, 8, 8, 'F')
  const tiles: [string, string][] = [
    ['Workouts', n(report.workouts)],
    ['Per week', report.perWeek.toFixed(1)],
    ['Sets', n(report.sets)],
    ['Records', n(report.records.length)],
  ]
  const tileW = (PAGE_W - MARGIN * 2) / tiles.length
  tiles.forEach(([labelText, value], i) => {
    const x = MARGIN + 16 + i * tileW
    font('bold', 7.5, DIM)
    doc.text(labelText.toUpperCase(), x, y + 19)
    font('bold', 17)
    doc.text(value, x, y + 40)
  })
  y += 54 + 6

  if (report.workouts === 0) {
    y += 18
    font('normal', 11, DIM)
    doc.text('No workouts logged in this range.', MARGIN, y)
    y += LINE
  } else {
    heading('Lifts')
    table(
      [
        { header: 'Exercise', x: MARGIN, width: 150 },
        { header: 'Sessions', x: 202, width: 46, align: 'right' },
        { header: 'Best set', x: 262, width: 130 },
        { header: 'Start 1RM', x: 394, width: 54, align: 'right' },
        { header: 'End 1RM', x: 452, width: 54, align: 'right' },
        { header: 'Change', x: 510, width: 54, align: 'right' },
      ],
      report.lifts.map((l) => [
        l.name,
        n(l.sessions),
        l.bestSet,
        l.e1rmStart === null ? '' : `${n(l.e1rmStart)} ${report.unit}`,
        l.e1rmEnd === null ? '' : `${n(l.e1rmEnd)} ${report.unit}`,
        e1rmChange(l, report.unit),
      ]),
    )
    note(
      '1RM is an estimated one-rep max (Epley formula), from the best set of the first and the last session in this range. ' +
        'It applies to weighted lifts with 12 reps or fewer.',
    )

    if (report.muscles.length > 0) {
      heading('Sets per muscle group')
      table(
        [
          { header: 'Muscle group', x: MARGIN, width: 200 },
          { header: 'Sets', x: 262, width: 60, align: 'right' },
          { header: 'Per week', x: 340, width: 60, align: 'right' },
        ],
        report.muscles.map((m) => [
          MUSCLE_GROUP_LABELS[m.group],
          formatSets(m.sets),
          (m.sets / (report.days / 7)).toFixed(1),
        ]),
      )
      note('A set counts once for its main muscle and half for each muscle it also works.')
    }
  }

  if (report.workouts > 0 && report.lifts.some((l) => l.sources)) {
    heading('Where the numbers come from')
    const rows: string[][] = []
    for (const l of report.lifts) {
      if (!l.sources) continue
      const { first, last } = l.sources
      const value = (e: number | null) => (e === null ? '' : `${n(e)} ${report.unit}`)
      rows.push([l.name, shortDate(first.performedAt), first.set, value(first.e1rm)])
      if (l.sessions > 1) rows.push(['', shortDate(last.performedAt), last.set, value(last.e1rm)])
    }
    table(
      [
        { header: 'Exercise', x: MARGIN, width: 190 },
        { header: 'Session', x: 250, width: 60 },
        { header: 'Set used', x: 322, width: 130 },
        { header: 'Est. 1RM', x: 460, width: 104, align: 'right' },
      ],
      rows,
    )
    if (report.records.length > 0) {
      font('bold', 10)
      ensure(LINE * 3)
      doc.text('Records', MARGIN, y)
      y += LINE + 2
      table(
        [
          { header: 'Date', x: MARGIN, width: 60 },
          { header: 'Exercise', x: 116, width: 150 },
          { header: 'Set', x: 280, width: 100 },
          { header: 'Beat', x: 392, width: 172 },
        ],
        report.records.map((r) => [
          shortDate(r.performedAt),
          r.name,
          r.set,
          r.beat ? `${r.beat.set} from ${shortDate(r.beat.performedAt)}` : '',
        ]),
      )
    }
    note('Each Est. 1RM is the Epley formula on the set shown. A record lists the set it beat.')
  }

  if (report.bodyWeight) {
    const bw = report.bodyWeight
    heading('Body weight')
    font('normal', 10)
    const diff = Math.round((bw.end - bw.start) * 10) / 10
    const text =
      bw.entries === 1
        ? `${n(bw.start)} ${report.unit} on ${shortDate(bw.startAt)} (1 weigh-in).`
        : `${n(bw.start)} ${report.unit} on ${shortDate(bw.startAt)} to ${n(bw.end)} ${report.unit} on ${shortDate(bw.endAt)} ` +
          `(${diff === 0 ? 'no change' : `${diff > 0 ? '+' : '-'}${n(Math.abs(diff))} ${report.unit}`}, ${bw.entries} weigh-ins).`
    doc.text(text, MARGIN, y)
    y += LINE + 4
  }

  if (report.workouts > 0) {
    heading('Records')
    if (report.records.length === 0) {
      font('normal', 10, DIM)
      doc.text('No new records in this range.', MARGIN, y)
      y += LINE
    } else {
      table(
        [
          { header: 'Date', x: MARGIN, width: 60 },
          { header: 'Exercise', x: 116, width: 220 },
          { header: 'Set', x: 350, width: 214 },
        ],
        report.records.map((r) => [shortDate(r.performedAt), r.name, r.set]),
      )
      note('A record is a set that beat every earlier set of that exercise.')
    }
  }

  // Footer on every page: small branding, the date made, page numbers.
  const pages = doc.getNumberOfPages()
  const made = generatedAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    rule(PAGE_H - 44)
    font('normal', 8, DIM)
    doc.text(`Made with RepBunny (repbunny.app) on ${made}`, MARGIN, PAGE_H - 30)
    doc.text(`Page ${p} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 30, { align: 'right' })
  }

  return doc.output('blob')
}
