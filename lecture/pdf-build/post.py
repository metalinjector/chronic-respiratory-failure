# -*- coding: utf-8 -*-
"""Post-processing of the lecture PDF.
  extract <pdf> <pages.json>                 : find heading page markers (pass 1)
  finalize <pdf_in> <pages.json> <pdf_out>   : strip soft hyphens, add running heads, page numbers, outline, metadata
"""
import sys, re, json, datetime, os
import pikepdf
import pymupdf

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_REG = os.path.join(HERE, 'fonts', 'PT_Sans-Web-Regular.ttf')
FONT_IT = os.path.join(HERE, 'fonts', 'PT_Sans-Web-Italic.ttf')
FONT_BOLD = os.path.join(HERE, 'fonts', 'PT_Sans-Web-Bold.ttf')
HEADINGS = os.path.join(HERE, 'headings.json')
TITLE = 'Хроническая дыхательная недостаточность'

def extract(pdf, out):
    d = pymupdf.open(pdf)
    pages = {}
    for i, p in enumerate(d):
        for m in re.findall(r'⟦(\d+)⟧', p.get_text()):
            pages.setdefault(int(m), i + 1)
    json.dump(pages, open(out, 'w'))
    print('pages', len(d), 'markers', len(pages))

def strip_soft_hyphens(src, dst):
    pdf = pikepdf.open(src)
    n_removed = 0
    for page in pdf.pages:
        try:
            ops = pikepdf.parse_content_stream(page)
        except Exception as e:
            print('parse failed', e); continue
        out = []; skip = 0; changed = False
        for operands, op in ops:
            o = str(op)
            if skip == 0 and o == 'BDC' and len(operands) == 2 and isinstance(operands[1], pikepdf.Dictionary) and '/ActualText' in operands[1]:
                try:
                    at = str(operands[1].ActualText)
                except Exception:
                    at = None
                if at is not None and at.replace('\ufeff', '') == '\xad':
                    skip = 1; changed = True; n_removed += 1
                    continue
            if skip:
                if o == 'BDC':
                    skip += 1; continue
                if o == 'EMC':
                    skip -= 1; continue
                if o in ('Tj', 'TJ', "'", '"'):
                    continue
                out.append((operands, op))
                continue
            out.append((operands, op))
        if changed:
            page.Contents = pdf.make_stream(pikepdf.unparse_content_stream(out))
    pdf.save(dst)
    print('soft hyphen spans removed:', n_removed)

def finalize(pdf_in, pages_json, pdf_out):
    tmp = pdf_out + '.tmp.pdf'
    strip_soft_hyphens(pdf_in, tmp)
    pages = {int(k): v for k, v in json.load(open(pages_json)).items()}
    heads = json.load(open(HEADINGS))
    byidx = {h['idx']: h for h in heads}
    d = pymupdf.open(tmp)
    npages = len(d)
    # page -> running head text
    opener_pages = set(pages[h['idx']] for h in heads if h.get('opener'))
    first_part_page = min(pages[h['idx']] for h in heads if h['level'] == 2)
    # events: (page, text) for h2 and chapter h3
    events = []
    for h in heads:
        if h['idx'] not in pages: continue
        if h['level'] == 2:
            events.append((pages[h['idx']], h['text']))
        elif h['level'] == 3 and h.get('isChapter2'):
            events.append((pages[h['idx']], h['text']))
    events.sort()
    run = {}
    cur = ''
    ei = 0
    for pg in range(1, npages + 1):
        while ei < len(events) and events[ei][0] <= pg:
            cur = events[ei][1]; ei += 1
        run[pg] = cur
    font_reg = pymupdf.Font(fontfile=FONT_REG)
    font_it = pymupdf.Font(fontfile=FONT_IT)
    gray = (0.36, 0.40, 0.44)
    navy = (0.09, 0.21, 0.36)
    for i, page in enumerate(d):
        pg = i + 1
        if pg == 1:
            continue
        W, H = page.rect.width, page.rect.height
        landscape = W > H
        ml = mr = (20 if landscape else 18) * 72 / 25.4
        page.insert_font(fontname='PTSans', fontfile=FONT_REG)
        page.insert_font(fontname='PTSansIt', fontfile=FONT_IT)
        fs = 8.2
        # footer page number
        num = str(pg)
        tw = font_reg.text_length(num, fontsize=9)
        page.insert_text(pymupdf.Point((W - tw) / 2, H - 30), num, fontname='PTSans', fontsize=9, color=gray)
        if pg in opener_pages:
            continue
        # header
        y = 38
        left = TITLE
        page.insert_text(pymupdf.Point(ml, y), left, fontname='PTSansIt', fontsize=fs, color=gray)
        right = run.get(pg, '') if pg >= first_part_page else ''
        if right:
            maxw = (W - ml - mr) * 0.55
            txt = right
            while font_reg.text_length(txt, fontsize=fs) > maxw and len(txt) > 10:
                txt = txt[:-2].rstrip() + '…'
            tw = font_reg.text_length(txt, fontsize=fs)
            page.insert_text(pymupdf.Point(W - mr - tw, y), txt, fontname='PTSans', fontsize=fs, color=navy)
        page.draw_line(pymupdf.Point(ml, y + 5), pymupdf.Point(W - mr, y + 5), color=(0.78, 0.82, 0.86), width=0.5)
    # outline
    toc = []
    toc.append([1, 'Как пользоваться лекцией', 2])
    toc.append([1, 'Содержание', 3])
    prev_level = 1
    for h in heads:
        if h['idx'] not in pages: continue
        if h['level'] > 4: continue
        lvl = h['level'] - 1  # h2 -> 1
        if lvl > prev_level + 1: lvl = prev_level + 1
        toc.append([lvl, h['text'], pages[h['idx']]])
        prev_level = lvl
    d.set_toc(toc)
    d.set_metadata({
        'title': TITLE + ' — лекция',
        'author': 'Arena.ai Agent Mode',
        'subject': 'Учебная лекция: физиология, диагностика, длительная кислородотерапия и домашняя вентиляция, острая декомпенсация, организация помощи, паллиативные и этические аспекты',
        'keywords': 'хроническая дыхательная недостаточность; гипоксемия; гиперкапния; ДКТ; НИВЛ; домашняя вентиляция; ХОБЛ; нервно-мышечные заболевания; синдром ожирения-гиповентиляции; лёгочное сердце',
        'creator': 'Markdown → HTML → Chromium (print), PyMuPDF',
        'producer': 'Arena.ai',
        'creationDate': pymupdf.get_pdf_now(),
        'modDate': pymupdf.get_pdf_now(),
    })
    d.save(pdf_out, garbage=3, deflate=True)
    d.close()
    os.remove(tmp)
    print('final pages', npages, 'toc entries', len(toc), '->', pdf_out)

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'extract':
        extract(sys.argv[2], sys.argv[3])
    elif cmd == 'finalize':
        finalize(sys.argv[2], sys.argv[3], sys.argv[4])
