import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('referencias/TESTE.xlsx', 'r') as z:
    styles_xml = z.read('xl/styles.xml').decode('utf-8')
    root = ET.fromstring(styles_xml)
    
    # Namespaces
    ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
    
    # Parse dxfs (differential formatting for conditional formatting)
    dxfs = root.find('main:dxfs', ns)
    dxf_list = []
    if dxfs is not None:
        for idx, dxf in enumerate(dxfs.findall('main:dxf', ns)):
            fill = dxf.find('main:fill', ns)
            font = dxf.find('main:font', ns)
            
            fill_color = None
            if fill is not None:
                pattern = fill.find('main:patternFill', ns)
                if pattern is not None:
                    fg = pattern.find('main:fgColor', ns)
                    bg = pattern.find('main:bgColor', ns)
                    if fg is not None:
                        fill_color = fg.attrib
                    elif bg is not None:
                        fill_color = bg.attrib
            
            font_color = None
            font_bold = False
            if font is not None:
                c = font.find('main:color', ns)
                if c is not None:
                    font_color = c.attrib
                b = font.find('main:b', ns)
                if b is not None:
                    font_bold = True
            
            dxf_list.append({
                'id': idx,
                'fill': fill_color,
                'font_color': font_color,
                'font_bold': font_bold
            })
            
    print(f"Total dxfs parsed: {len(dxf_list)}")
    for d in dxf_list[:30]:
        print(d)

