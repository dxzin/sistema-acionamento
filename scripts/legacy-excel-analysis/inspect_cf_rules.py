import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('referencias/TESTE.xlsx', 'r') as z:
    styles_xml = z.read('xl/styles.xml').decode('utf-8')
    root = ET.fromstring(styles_xml)
    ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    dxfs = root.find('main:dxfs', ns)
    dxf_map = {}
    if dxfs is not None:
        for idx, dxf in enumerate(dxfs.findall('main:dxf', ns)):
            fill = dxf.find('main:fill', ns)
            font = dxf.find('main:font', ns)
            fill_info = None
            if fill is not None:
                pf = fill.find('main:patternFill', ns)
                if pf is not None:
                    fg = pf.find('main:fgColor', ns)
                    bg = pf.find('main:bgColor', ns)
                    fill_info = fg.attrib if fg is not None else (bg.attrib if bg is not None else None)
            
            font_info = None
            if font is not None:
                c = font.find('main:color', ns)
                font_info = c.attrib if c is not None else None
            
            dxf_map[idx] = {'fill': fill_info, 'font': font_info}

    # Now let's inspect sheet XML for 02.06.26 and 02.06.26 - UBJP
    def inspect_sheet_cf(xml_path, sheet_label):
        print(f"\n==================== CF RULES FOR: {sheet_label} ({xml_path}) ====================")
        sheet_xml = z.read(xml_path).decode('utf-8')
        s_root = ET.fromstring(sheet_xml)
        for cf in s_root.findall('main:conditionalFormatting', ns):
            sqref = cf.get('sqref')
            for rule in cf.findall('main:cfRule', ns):
                rtype = rule.get('type')
                op = rule.get('operator')
                dxf_id = rule.get('dxfId')
                formulas = [f.text for f in rule.findall('main:formula', ns)]
                
                style = dxf_map.get(int(dxf_id)) if dxf_id is not None else None
                print(f"Range: {sqref} | Type: {rtype} | Op: {op} | Formulas: {formulas} | Style: {style}")

    # Find sheet xml paths
    wb_xml = z.read('xl/workbook.xml').decode('utf-8')
    wb_root = ET.fromstring(wb_xml)
    sheets_elem = wb_root.find('main:sheets', ns)
    
    rels_xml = z.read('xl/_rels/workbook.xml.rels').decode('utf-8')
    r_root = ET.fromstring(rels_xml)
    r_ns = {'r': 'http://schemas.openxmlformats.org/package/2006/relationships'}
    r_map = {rel.get('Id'): rel.get('Target') for rel in r_root.findall('r:Relationship', r_ns)}
    
    for s in sheets_elem.findall('main:sheet', ns):
        s_name = s.get('name')
        r_id = s.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        target = r_map.get(r_id)
        if s_name in ['02.06.26', '02.06.26  - UBJP', 'Escala Junho 2026 - SP', 'Escala Junho 2026 - MG']:
            inspect_sheet_cf(f"xl/{target}", s_name)

