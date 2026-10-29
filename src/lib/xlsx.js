// Minimal .xlsx writer (no dependencies). Writes the sheets produced by
// buildPack() with styles, frozen headers, column widths and live formulas.
import { PACK_STYLES } from './pack.js'

var enc = new TextEncoder()
var CRC = (function () {
  var t = new Uint32Array(256)
  for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 }
  return t
})()
function crc32(b) { var c = 0xffffffff; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function zip(files) {
  var parts = [], central = [], offset = 0
  files.forEach(function (f) {
    var name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data)
    var h = new DataView(new ArrayBuffer(30))
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true)
    h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true)
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true)
    parts.push(new Uint8Array(h.buffer), name, data)
    var c = new DataView(new ArrayBuffer(46))
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true)
    c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true)
    c.setUint16(28, name.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true)
    c.setUint32(38, 0, true); c.setUint32(42, offset, true)
    central.push(new Uint8Array(c.buffer), name)
    offset += 30 + name.length + data.length
  })
  var cdSize = central.reduce(function (s, p) { return s + p.length }, 0)
  var e = new DataView(new ArrayBuffer(22))
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true)
  e.setUint32(12, cdSize, true); e.setUint32(16, offset, true)
  var all = parts.concat(central, [new Uint8Array(e.buffer)])
  var out = new Uint8Array(all.reduce(function (s, p) { return s + p.length }, 0)), pos = 0
  all.forEach(function (p) { out.set(p, pos); pos += p.length })
  return out
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '') }
function colName(n) { var s = ''; n++; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }
function serial(d) { var p = d.split('-').map(Number); return (Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 86400000 }
function argb(hex) { return 'FF' + hex.replace('#', '').toUpperCase() }

function buildStyles() {
  var fonts = ['<font><sz val="10"/><name val="Arial"/></font>'], fontKey = { '': 0 }
  var fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], fillKey = {}
  var numFmts = [], numKey = {}
  var xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'], index = {}
  Object.keys(PACK_STYLES).forEach(function (name) {
    var st = PACK_STYLES[name]
    var fk = (st.bold ? 'b' : '') + (st.italic ? 'i' : '') + (st.size || '') + (st.color || '')
    if (fontKey[fk] === undefined) {
      fontKey[fk] = fonts.length
      fonts.push('<font>' + (st.bold ? '<b/>' : '') + (st.italic ? '<i/>' : '') + '<sz val="' + (st.size || 10) + '"/>' + (st.color ? '<color rgb="' + argb(st.color) + '"/>' : '') + '<name val="Arial"/></font>')
    }
    var fillId = 0
    if (st.fill) {
      if (fillKey[st.fill] === undefined) { fillKey[st.fill] = fills.length; fills.push('<fill><patternFill patternType="solid"><fgColor rgb="' + argb(st.fill) + '"/><bgColor indexed="64"/></patternFill></fill>') }
      fillId = fillKey[st.fill]
    }
    var numId = 0
    if (st.num) {
      if (st.num === '0') numId = 1
      else if (st.num === '0%') numId = 9
      else { if (numKey[st.num] === undefined) { numKey[st.num] = 164 + numFmts.length; numFmts.push('<numFmt numFmtId="' + numKey[st.num] + '" formatCode="' + esc(st.num) + '"/>') } numId = numKey[st.num] }
    }
    index[name] = xfs.length
    xfs.push('<xf numFmtId="' + numId + '" fontId="' + fontKey[fk] + '" fillId="' + fillId + '" borderId="' + (st.top ? 1 : 0) + '" xfId="0"' +
      (numId ? ' applyNumberFormat="1"' : '') + (fk ? ' applyFont="1"' : '') + (fillId ? ' applyFill="1"' : '') + (st.top ? ' applyBorder="1"' : '') +
      (name === 'note' || name === 'sub' ? ' applyAlignment="1"><alignment wrapText="0"/></xf>' : '/>'))
  })
  var xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (numFmts.length ? '<numFmts count="' + numFmts.length + '">' + numFmts.join('') + '</numFmts>' : '') +
    '<fonts count="' + fonts.length + '">' + fonts.join('') + '</fonts>' +
    '<fills count="' + fills.length + '">' + fills.join('') + '</fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF0B2440"/></top><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + xfs.length + '">' + xfs.join('') + '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  return { xml: xml, index: index }
}

function sheetXml(sh, styleIndex) {
  var rows = sh.rows.map(function (row, ri) {
    var r = ri + 1
    var cells = row.map(function (cell, ci) {
      if (cell === null || cell === undefined || cell === '') return ''
      var ref = colName(ci) + r
      var c = typeof cell === 'object' ? cell : { v: cell }
      var s = c.s ? ' s="' + styleIndex[c.s] + '"' : ''
      if (c.f) return '<c r="' + ref + '"' + s + '><f>' + esc(c.f) + '</f></c>'
      var v = c.v
      if (v === null || v === undefined || v === '') return c.s ? '<c r="' + ref + '"' + s + '/>' : ''
      if ((c.s === 'date' || c.s === 'dateIn') && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return '<c r="' + ref + '"' + s + '><v>' + serial(v.slice(0, 10)) + '</v></c>'
      if (typeof v === 'number') return '<c r="' + ref + '"' + s + '><v>' + v + '</v></c>'
      if (typeof v === 'boolean') v = v ? 'Yes' : ''
      return '<c r="' + ref + '"' + s + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>'
    }).join('')
    return '<row r="' + r + '">' + cells + '</row>'
  }).join('')
  var pane = sh.freeze ? '<pane ySplit="' + sh.freeze + '" topLeftCell="A' + (sh.freeze + 1) + '" activePane="bottomLeft" state="frozen"/>' : ''
  var cols = (sh.widths || []).map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>' }).join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="' + (sh.freeze === 0 ? '0' : '1') + '">' + pane + '</sheetView></sheetViews>' +
    (cols ? '<cols>' + cols + '</cols>' : '') + '<sheetData>' + rows + '</sheetData></worksheet>'
}

/** Returns the .xlsx file as bytes. */
export function writeXlsx(sheets) {
  var st = buildStyles()
  var files = [
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map(function (_, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' }).join('') + '</Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map(function (s, i) { return '<sheet name="' + esc(s.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>' }).join('') + '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map(function (_, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>' }).join('') +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: 'xl/styles.xml', data: st.xml },
  ].concat(sheets.map(function (s, i) { return { name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: sheetXml(s, st.index) } }))
  return zip(files)
}
