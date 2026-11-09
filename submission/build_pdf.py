from html import escape
from docx import Document
from docx.oxml.ns import qn
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

SOURCE = 'submission/Tales-of-Hyderabad-TDD.docx'
OUTPUT = 'submission/Tales-of-Hyderabad-TDD.pdf'
REPO = 'https://github.com/naurjhanvi/Tales-OF-Hyderabad'
FONT = 'C:/Windows/Fonts/arial.ttf'
BOLD_FONT = 'C:/Windows/Fonts/arialbd.ttf'
pdfmetrics.registerFont(TTFont('Arial', FONT))
pdfmetrics.registerFont(TTFont('Arial-Bold', BOLD_FONT))

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyToh', fontName='Arial', fontSize=9.6, leading=12.4, textColor=colors.HexColor('#232A34'), spaceAfter=5, allowWidows=0, allowOrphans=0))
styles.add(ParagraphStyle(name='TitleToh', fontName='Arial-Bold', fontSize=22, leading=25, textColor=colors.black, spaceBefore=7, spaceAfter=2, keepWithNext=True))
styles.add(ParagraphStyle(name='H1Toh', fontName='Arial-Bold', fontSize=14.2, leading=17, textColor=colors.black, spaceBefore=12, spaceAfter=5, keepWithNext=True))
styles.add(ParagraphStyle(name='H2Toh', fontName='Arial-Bold', fontSize=11.1, leading=14, textColor=colors.black, spaceBefore=8, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name='MetaToh', fontName='Arial', fontSize=9.1, leading=12, textColor=colors.HexColor('#556171'), spaceAfter=8))
styles.add(ParagraphStyle(name='TableToh', fontName='Arial', fontSize=7.9, leading=10.1, textColor=colors.HexColor('#232A34'), spaceAfter=0))
styles.add(ParagraphStyle(name='TableHeadToh', fontName='Arial-Bold', fontSize=8.1, leading=10.2, textColor=colors.white, spaceAfter=0))
styles.add(ParagraphStyle(name='BulletToh', fontName='Arial', fontSize=9.5, leading=12, textColor=colors.HexColor('#232A34'), leftIndent=15, firstLineIndent=-10, spaceAfter=3.2))
styles.add(ParagraphStyle(name='NumberToh', fontName='Arial', fontSize=9.5, leading=12, textColor=colors.HexColor('#232A34'), leftIndent=18, firstLineIndent=-14, spaceAfter=3.2))
styles.add(ParagraphStyle(name='LinkToh', fontName='Arial', fontSize=9, leading=11, textColor=colors.HexColor('#1F4E79'), spaceAfter=2))


def normalize(text):
    return text.replace('\u2192', 'to').replace('\u2014', '-').replace('\u2013', '-').replace('\u2011', '-')


def ptext(text, style='BodyToh'):
    safe = escape(normalize(text)).replace('\n', '<br/>')
    return Paragraph(safe, styles[style])


def decorate(canvas, doc):
    canvas.saveState()
    page_w, page_h = letter
    canvas.setFont('Arial-Bold', 7)
    canvas.setFillColor(colors.HexColor('#556171'))
    canvas.drawRightString(page_w - 0.72 * inch, page_h - 0.42 * inch, 'TALES OF HYDERABAD  |  TECHNICAL DESIGN')
    canvas.setFont('Arial', 7.5)
    canvas.drawCentredString(page_w / 2, 0.36 * inch, f'Tales of Hyderabad  |  {doc.page}')
    canvas.restoreState()


def table_flow(doc_table):
    source_rows = [[cell.text for cell in row.cells] for row in doc_table.rows]
    if not source_rows:
        return None
    matrix = []
    for row_index, row in enumerate(source_rows):
        style = 'TableHeadToh' if row_index == 0 else 'TableToh'
        matrix.append([ptext(value, style) for value in row])
    col_widths = []
    for column in doc_table.columns:
        width = column.width
        col_widths.append(float(width) * 72 / 914400 if width else (7.06 * inch / len(source_rows[0])))
    available = 7.06 * inch
    actual = sum(col_widths)
    if actual > available:
        col_widths = [width * available / actual for width in col_widths]
    tbl = Table(matrix, colWidths=col_widths, repeatRows=1, hAlign='CENTER', splitByRow=1)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#24364B')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F3F6F9')]),
        ('GRID', (0, 0), (-1, -1), 0.45, colors.HexColor('#D6DCE4')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return tbl


docx = Document(SOURCE)
story = []
link = Paragraph(f'<b>GitHub project:</b> <link href="{REPO}" color="#1F4E79"><u>{REPO}</u></link>', styles['LinkToh'])
story.extend([link, Paragraph('Tales of Hyderabad Technical Design Document', styles['TitleToh']), Paragraph('Direct ordering, kitchen operations and central menu management  |  9 November 2026', styles['MetaToh'])])
body = docx._body._element
number_index = 0
for child in body.iterchildren():
    if child.tag == qn('w:p'):
        from docx.text.paragraph import Paragraph as DocxParagraph
        paragraph = DocxParagraph(child, docx._body)
        text = paragraph.text.strip()
        if not text or text.startswith('GitHub project:') or text == 'Tales of Hyderabad Technical Design Document':
            continue
        if text.startswith('Direct ordering, kitchen operations and central menu management'):
            continue
        style_name = paragraph.style.name if paragraph.style else 'Normal'
        if style_name == 'Title':
            continue
        if style_name == 'Heading 1':
            if text == 'Assumptions and limits':
                story.append(PageBreak())
            story.append(Paragraph(escape(normalize(text)), styles['H1Toh']))
            number_index = 0
        elif style_name == 'Heading 2':
            story.append(Paragraph(escape(normalize(text)), styles['H2Toh']))
        elif style_name == 'List Bullet':
            story.append(Paragraph('&#8226;  ' + escape(normalize(text)), styles['BulletToh']))
        elif style_name == 'List Number':
            number_index += 1
            story.append(Paragraph(f'{number_index}.  ' + escape(normalize(text)), styles['NumberToh']))
        else:
            story.append(ptext(text))
    elif child.tag == qn('w:tbl'):
        from docx.table import Table as DocxTable
        table = DocxTable(child, docx._body)
        flow = table_flow(table)
        if flow:
            story.extend([Spacer(1, 3), flow, Spacer(1, 8)])

pdf = SimpleDocTemplate(OUTPUT, pagesize=letter, rightMargin=0.72*inch, leftMargin=0.72*inch, topMargin=0.66*inch, bottomMargin=0.56*inch, title='Tales of Hyderabad Technical Design Document', author='Tales of Hyderabad project team', subject='Software engineering submission')
pdf.build(story, onFirstPage=decorate, onLaterPages=decorate)
print(OUTPUT)
