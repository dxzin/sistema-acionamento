import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('referencias/TESTE.xlsx', 'r') as z:
    content = z.read('xl/charts/chart1.xml').decode('utf-8')
    # search for formulas / references
    import re
    refs = re.findall(r'<c:f>([^<]+)</c:f>', content)
    titles = re.findall(r'<c:v>([^<]+)</c:v>', content)
    print("Chart references:", refs)
    print("Chart values/titles:", titles[:10])

