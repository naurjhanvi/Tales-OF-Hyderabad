from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_SECTION

OUT = 'submission/Tales-of-Hyderabad-TDD.docx'
REPO = 'https://github.com/naurjhanvi/Tales-OF-Hyderabad'


def set_cell_shading(cell, fill):
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), fill)
    tc_pr.append(shd)


def set_cell_margins(cell, top=95, start=105, bottom=95, end=105):
    tc = cell._tc
    tc_pr = tc.get_or_add_tcPr()
    margins = tc_pr.first_child_found_in('w:tcMar')
    if margins is None:
        margins = OxmlElement('w:tcMar')
        tc_pr.append(margins)
    for tag, value in [('top', top), ('start', start), ('bottom', bottom), ('end', end)]:
        node = margins.find(qn(f'w:{tag}'))
        if node is None:
            node = OxmlElement(f'w:{tag}')
            margins.append(node)
        node.set(qn('w:w'), str(value))
        node.set(qn('w:type'), 'dxa')


def set_repeat_table_header(row):
    tr_pr = row._tr.get_or_add_trPr()
    repeat = OxmlElement('w:tblHeader')
    repeat.set(qn('w:val'), 'true')
    tr_pr.append(repeat)


def set_table_borders(table):
    tbl = table._tbl
    tbl_pr = tbl.tblPr
    borders = OxmlElement('w:tblBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        item = OxmlElement(f'w:{edge}')
        item.set(qn('w:val'), 'single')
        item.set(qn('w:sz'), '5')
        item.set(qn('w:space'), '0')
        item.set(qn('w:color'), 'D6DCE4')
        borders.append(item)
    tbl_pr.append(borders)


def add_hyperlink(paragraph, text, url):
    part = paragraph.part
    rid = part.relate_to(url, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink', is_external=True)
    link = OxmlElement('w:hyperlink')
    link.set(qn('r:id'), rid)
    run = OxmlElement('w:r')
    props = OxmlElement('w:rPr')
    color = OxmlElement('w:color')
    color.set(qn('w:val'), '1F4E79')
    props.append(color)
    underline = OxmlElement('w:u')
    underline.set(qn('w:val'), 'single')
    props.append(underline)
    run.append(props)
    text_node = OxmlElement('w:t')
    text_node.text = text
    run.append(text_node)
    link.append(run)
    paragraph._p.append(link)


def add_field(run, instruction):
    begin = OxmlElement('w:fldChar')
    begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = instruction
    separate = OxmlElement('w:fldChar')
    separate.set(qn('w:fldCharType'), 'separate')
    value = OxmlElement('w:t')
    value.text = '1'
    end = OxmlElement('w:fldChar')
    end.set(qn('w:fldCharType'), 'end')
    for element in (begin, instr, separate, value, end):
        run._r.append(element)


def setup_doc():
    doc = Document()
    sec = doc.sections[0]
    sec.page_width = Inches(8.5)
    sec.page_height = Inches(11)
    sec.top_margin = Inches(0.65)
    sec.bottom_margin = Inches(0.65)
    sec.left_margin = Inches(0.72)
    sec.right_margin = Inches(0.72)
    styles = doc.styles
    normal = styles['Normal']
    normal.font.name = 'Aptos'
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = RGBColor(35, 42, 52)
    normal.paragraph_format.space_after = Pt(5)
    normal.paragraph_format.line_spacing = 1.08
    for name, size in [('Title', 25), ('Heading 1', 16), ('Heading 2', 12)]:
        style = styles[name]
        style.font.name = 'Aptos Display' if name != 'Normal' else 'Aptos'
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(12 if name == 'Heading 1' else 8)
        style.paragraph_format.space_after = Pt(5)
        style.paragraph_format.keep_with_next = True
    styles['Title'].paragraph_format.space_before = Pt(8)
    styles['Title'].paragraph_format.space_after = Pt(2)
    for style_name in ['List Bullet', 'List Number']:
        styles[style_name].font.name = 'Aptos'
        styles[style_name].font.size = Pt(10.5)
        styles[style_name].paragraph_format.space_after = Pt(3)
    header = sec.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    header.paragraph_format.space_after = Pt(0)
    run = header.add_run('TALES OF HYDERABAD  |  TECHNICAL DESIGN')
    run.font.name = 'Aptos'
    run.font.size = Pt(8)
    run.font.bold = True
    run.font.color.rgb = RGBColor(85, 97, 113)
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.paragraph_format.space_before = Pt(2)
    run = footer.add_run('Tales of Hyderabad  ·  ')
    run.font.size = Pt(8)
    run.font.color.rgb = RGBColor(85, 97, 113)
    page = footer.add_run()
    page.font.size = Pt(8)
    page.font.color.rgb = RGBColor(85, 97, 113)
    add_field(page, 'PAGE')
    return doc


def add_table(doc, headers, rows, widths=None, font_size=9.2):
    table = doc.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    set_table_borders(table)
    if widths:
        for col, width in zip(table.columns, widths):
            col.width = Inches(width)
    head = table.rows[0]
    set_repeat_table_header(head)
    for index, label in enumerate(headers):
        cell = head.cells[index]
        set_cell_shading(cell, '24364B')
        set_cell_margins(cell)
        cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.keep_together = True
        run = p.add_run(label)
        run.font.name = 'Aptos'
        run.font.size = Pt(font_size)
        run.font.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
    for row_index, values in enumerate(rows):
        cells = table.add_row().cells
        for index, value in enumerate(values):
            cell = cells[index]
            set_cell_margins(cell)
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            if row_index % 2 == 1:
                set_cell_shading(cell, 'F3F6F9')
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            run = p.add_run(str(value))
            run.font.name = 'Aptos'
            run.font.size = Pt(font_size)
            run.font.color.rgb = RGBColor(35, 42, 52)
        if widths:
            for cell, width in zip(cells, widths):
                cell.width = Inches(width)
    doc.add_paragraph().paragraph_format.space_after = Pt(1)
    return table


def para(doc, text, bold_prefix=None):
    p = doc.add_paragraph()
    if bold_prefix and text.startswith(bold_prefix):
        r = p.add_run(bold_prefix)
        r.bold = True
        p.add_run(text[len(bold_prefix):])
    else:
        p.add_run(text)
    return p


def bullet(doc, text):
    return doc.add_paragraph(text, style='List Bullet')


doc = setup_doc()
link_p = doc.add_paragraph()
link_p.paragraph_format.space_after = Pt(4)
label = link_p.add_run('GitHub project: ')
label.bold = True
label.font.size = Pt(9.5)
add_hyperlink(link_p, REPO, REPO)

p = doc.add_paragraph(style='Title')
p.add_run('Tales of Hyderabad Technical Design Document')
p = doc.add_paragraph()
p.paragraph_format.space_after = Pt(10)
r = p.add_run('Direct ordering, kitchen operations and central menu management  |  9 November 2026')
r.font.size = Pt(10)
r.font.color.rgb = RGBColor(85, 97, 113)

para(doc, 'Tales of Hyderabad connects guest orders to outlet kitchens and a central menu workspace. The shipped slice covers guest ordering, cart and coupon checkout, simulated UPI/card records, kitchen status updates, menu and availability management, outlet offers, and order reporting. It uses a React web client, a Fastify API, and PostgreSQL. The payment provider, customer accounts, loyalty, catering and external messaging integrations are not connected.')

para(doc, 'The core design keeps prices and order state on the server. The browser submits selected menu options; the API validates availability, calculates the final amount, stores the order and publishes status events. The customer and kitchen screens receive changes through server-sent events, with periodic refresh as a recovery path.')

doc.add_heading('Product slice', level=1)
add_table(doc, ['Area', 'Working flow', 'Key behavior'], [
    ('Customer ordering', 'Guest chooses an outlet, browses dishes, configures portions, spice and add-ons, applies a coupon, chooses UPI or card, and tracks the order.', 'Postal-code coverage and manual outlet choice; API-owned price, GST and discount calculation; private tracking token.'),
    ('Kitchen display', 'Outlet staff sign in, review incoming tickets, move work through preparation, ready, rider handoff and delivery, and change item availability.', 'Outlet-scoped access, elapsed timers, late-order highlighting, immediate preparing status after acceptance, live event stream.'),
    ('Menu admin', 'Central staff manage dishes, portions, add-ons, spice levels, active state and outlet availability.', 'One shared base menu for the three seeded outlets; sales are outlet-specific.'),
    ('Offers and reporting', 'Admin creates coupons and item sales, then reviews order volume, discounts, revenue records, repeat customers, outlet activity and late orders.', 'Outlet-scoped coupons and sales; figures derive from stored order records.'),
], widths=[1.15, 3.35, 2.62])


doc.add_heading('Architecture and choices', level=1)
add_table(doc, ['Layer', 'Implementation', 'Reason'], [
    ('Web client', 'React with TanStack Start/Router, Vite and reusable components. Customer cart and private tracking tokens stay in browser storage; staff sessions use session storage.', 'Supports a responsive customer experience and separate customer, kitchen and admin entry points.'),
    ('Application API', 'Fastify with TypeScript. Zod validates request bodies and query values. JWT claims carry staff role and outlet assignment.', 'Keeps checkout and permissions server-side and gives staff routes a clear role boundary.'),
    ('Database', 'PostgreSQL stores menus, outlet coverage, item availability, sales, coupons, orders, payments and status history.', 'Relational constraints and transactions protect price snapshots, coupon redemption and order transitions.'),
    ('Live updates', 'A committed status change sends PostgreSQL NOTIFY. Fastify streams snapshots and status events over server-sent events; the web client refreshes the affected order or outlet board.', 'Avoids a kitchen-wide refresh for each client action. A 30-second refresh remains as recovery if the stream disconnects.'),
    ('Local runtime', 'Docker Compose runs PostgreSQL. Vite and the API run as separate Node services.', 'Keeps local setup reproducible while leaving production hosting choices open.'),
], widths=[1.05, 3.18, 2.89])

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(1)
p.paragraph_format.space_after = Pt(7)
r = p.add_run('Request path:  Browser  →  Fastify API  →  PostgreSQL')
r.font.name = 'Aptos'
r.font.size = Pt(9.5)
r.font.bold = True


doc.add_heading('Data model', level=1)
add_table(doc, ['Record group', 'Stored information', 'Important rule'], [
    ('Outlets and coverage', 'Outlet address, hours, FSSAI display fields, prep and delivery estimates, and supported postal codes.', 'A customer can choose an outlet that serves the entered postal code; the customer can also choose manually.'),
    ('Menu and options', 'Dish name, description, price in paise, diet mark, allergens, image key, portions, spice levels and add-ons.', 'Checkout re-reads active item and outlet availability before accepting an order.'),
    ('Sales and coupons', 'Outlet-specific sale price and schedule; coupon type, value, limits, outlet scope, active dates and redemptions.', 'Sale and coupon values are recalculated by the API at checkout.'),
    ('Orders and payment records', 'Order/customer snapshot, selected method, totals, applied discount, tracking-token hash, idempotency key and payment status.', 'Order lines keep price and item-name snapshots so later menu edits do not change prior orders.'),
    ('Status history', 'Status, timestamp, optional note and staff actor for each change.', 'The API permits only the next valid kitchen transition; staff tokens are restricted to their outlet.'),
], widths=[1.3, 3.05, 2.77])


doc.add_heading('Main flows', level=1)

doc.add_heading('Customer order', level=2)
for text in [
    'The customer enters a Hyderabad postal code or selects an outlet. The menu request is scoped to that outlet and hides unavailable items.',
    'The browser sends item identifiers, quantities and option identifiers, plus customer delivery details, selected payment method and optional coupon code. It does not send prices.',
    'The API validates the menu and outlet, calculates item prices, sale pricing, delivery fee, included 5% GST and coupon discount, then stores the order and a successful simulated payment record in one transaction.',
    'The API returns an order code and a high-entropy tracking token. The browser stores the token and sends it in a private header for order reads and event streams; PostgreSQL stores only its hash.',
    'The kitchen board accepts a new ticket and starts preparation in the same action. The API records both events and immediately sets the current customer status to preparing.',
]:
    doc.add_paragraph(text, style='List Number')


doc.add_heading('Kitchen updates', level=2)
para(doc, 'The kitchen board authenticates with a staff JWT and requests orders for its assigned outlet. A role check and an outlet check run before the API returns or changes records. Status changes use a database transaction; only after commit does the API publish a PostgreSQL notification for the customer and kitchen SSE streams. The browser reloads the corresponding order data when it receives a snapshot or status event. If a stream closes, the board continues periodic refresh and shows an update warning.')


doc.add_heading('Menu and offer management', level=2)
para(doc, 'Central admins create or edit a menu item and its options, then set its availability by outlet. An item sale is attached to specific outlets and may have start and end times. Coupons may be global or restricted to outlets, with minimum order, discount cap, total use limit and per-phone redemption limit. The customer offer panel lists active outlet sales and eligible coupons; the cart validates the code again before checkout.')


doc.add_heading('Automated preparation estimate', level=1)
para(doc, 'The estimate uses completed orders from the same outlet during the previous 30 days. It measures elapsed time from order placement until the first ready event. With at least five completed orders, the API uses the median. With fewer examples, missing history or an invalid estimate, it falls back to the outlet minimum. It adds three minutes per active kitchen order, capped at 15 minutes, and two minutes per additional basket item, capped at 10 minutes. The final promise is never below the outlet minimum.')
add_table(doc, ['Situation', 'Estimate basis', 'Safeguard'], [
    ('Fewer than five recent completions', 'Outlet minimum: 20, 22 or 25 minutes in the seed.', 'Avoids treating sparse data as reliable.'),
    ('At least five recent completions', 'Median placement-to-ready time for the outlet.', 'Uses local operating history instead of a chain-wide average.'),
    ('Current kitchen load or larger basket', 'Bounded queue and basket buffers.', 'Limits the extra time and preserves the minimum floor.'),
], widths=[1.7, 3.05, 2.37])
para(doc, 'This is a transparent statistical heuristic, not a trained machine-learning model. The outlet minimum provides the conservative fallback. A manager override for an individual estimate is not implemented; adding an override and a reviewable estimate history is a next step.')


doc.add_heading('Design decisions', level=1)
add_table(doc, ['Screen group', 'Design choice'], [
    ('Customer entry and menu', 'Warm ivory background, restrained chilli and saffron accents, food photography, clear diet/allergen marks, scannable prices and mobile-first spacing.'),
    ('Cart and checkout', 'Visible item options, coupon entry and savings, order total and delivery details in one short path. GST inclusion is stated; no payment credentials are requested.'),
    ('Order tracking', 'A compact status timeline emphasizes the active kitchen stage, expected ready time and order contents.'),
    ('Kitchen', 'Dark, high-contrast board with large ticket details, timers and color marking for late work; controls support a touch tablet.'),
    ('Admin', 'White, translucent glass surfaces with dark readable type, consistent navigation, outlet/date filters, actionable reports, menu controls and offer management.'),
], widths=[1.45, 5.67])


doc.add_heading('Security and data handling', level=1)
for text in [
    'Passwords are stored as bcrypt hashes. Staff API routes require a signed JWT; role checks separate menu administration from kitchen actions, and kitchen tokens are outlet-scoped.',
    'Zod schemas validate API inputs. Checkout uses server-side prices, idempotency keys, a database transaction and a private order tracking token whose hash is stored in the database.',
    'Environment examples contain blank secret fields. Local credentials and signing keys belong in ignored environment files, not source control. The ZIP contains documentation only, not local environment files or database exports.',
    'Guest checkout stores delivery contact details with the order. Marketing messages, customer accounts, consent management and a retention/deletion workflow are not implemented; a production deployment needs a reviewed privacy and retention process.',
]:
    bullet(doc, text)


doc.add_heading('Assumptions and limits', level=1)
for text in [
    'Assumption — the three seeded outlets, menu items, prices, hours, postal-code coverage and FSSAI display values are illustrative. The FSSAI numbers are not verified licences. The client brief describes 14 outlets and three cloud kitchens; this build models only Kondapur, Gachibowli and Kukatpally.',
    'Assumption — the seeded customer names, addresses and phone values are fictional. The starter orders are for review and do not represent real customer records.',
    'Assumption — all displayed menu prices include 5% GST. Delivery fee and menu values are starter values for this product slice, not client-approved commercial prices.',
    'Assumption — postal-code coverage is used as the delivery-area rule. GPS distance, geocoding, rider allocation and delivery-partner integration are not implemented.',
    'UPI and card are simulated. The selected method is recorded, but no payment gateway, settlement, refund or charge is performed.',
    'The shared menu uses one base price across the three seeded outlets. City-specific price books, time-based menu switching, loyalty points and customer accounts are not implemented.',
    'Catering intake and manager confirmation, WhatsApp/SMS updates, explicit late-order manager notifications, manager ETA overrides and reorder suggestions are not implemented.',
]:
    bullet(doc, text)


doc.add_heading('Verification and next work', level=1)
para(doc, 'Backend unit tests cover the estimate fallback, recent-history calculation, load and basket buffers, percentage and fixed discounts, discount caps and the subtotal ceiling. The frontend test checks application route registration. The backend TypeScript build, frontend TypeScript check, lint command and production frontend build were also run. The local seed completed successfully and created the three coupons and three starter orders. Automated end-to-end tests for browser checkout, staff authorization and SSE reconnection are not included.')
para(doc, 'Next work: connect a payment provider; add loyalty and customer consent; implement catering intake and confirmation; add outlet price books and time-based menus; let managers override estimates; send and audit late-order alerts; expand seed coverage to all 17 client locations; and run integration and browser end-to-end tests before a hosted release.')


doc.save(OUT)
print(OUT)
