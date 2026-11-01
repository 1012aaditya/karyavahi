"""
Print the rows of every sheet of an .xlsx file as JSON: {"Sheet name": [[cell, ...], ...]}.

Standard library only (zipfile + xml), so it runs with `python3 -I` and needs no openpyxl.
Shared strings and inline strings are resolved; numbers stay numbers; formulas give their
cached value. Nothing in the workbook is executed (an .xlsx is a zip of XML; macros cannot
live in one, and this reader would not run them anyway).

  python3 -I scripts/xlsx-rows.py path/to/file.xlsx
"""
import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'rel': 'http://schemas.openxmlformats.org/package/2006/relationships'}


def col_index(ref):
    letters = re.match(r'[A-Z]+', ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def text_of(si):
    return ''.join(t.text or '' for t in si.iter('{%s}t' % NS['m']))


def main(path):
    with zipfile.ZipFile(path) as z:
        names = set(z.namelist())
        shared = []
        if 'xl/sharedStrings.xml' in names:
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            shared = [text_of(si) for si in root.findall('m:si', NS)]
        wb = ET.fromstring(z.read('xl/workbook.xml'))
        rels = ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
        target = {r.get('Id'): r.get('Target') for r in rels.findall('rel:Relationship', NS)}
        out = {}
        for sh in wb.find('m:sheets', NS).findall('m:sheet', NS):
            rid = sh.get('{%s}id' % NS['r'])
            t = target[rid].lstrip('/')
            p = t if t.startswith('xl/') else 'xl/' + t
            root = ET.fromstring(z.read(p))
            rows = []
            for row in root.iter('{%s}row' % NS['m']):
                cells = {}
                for c in row.findall('m:c', NS):
                    ref, typ = c.get('r'), c.get('t')
                    v = c.find('m:v', NS)
                    if typ == 's' and v is not None:
                        val = shared[int(v.text)]
                    elif typ == 'inlineStr':
                        is_ = c.find('m:is', NS)
                        val = text_of(is_) if is_ is not None else ''
                    elif v is None:
                        val = None
                    elif typ in ('str', 'e'):
                        val = v.text
                    elif typ == 'b':
                        val = v.text == '1'
                    else:
                        try:
                            f = float(v.text)
                            val = int(f) if f.is_integer() else f
                        except (TypeError, ValueError):
                            val = v.text
                    cells[col_index(ref)] = val
                if cells:
                    width = max(cells) + 1
                    rows.append([cells.get(i) for i in range(width)])
                else:
                    rows.append([])
            out[sh.get('name')] = rows
    json.dump(out, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    main(sys.argv[1])
