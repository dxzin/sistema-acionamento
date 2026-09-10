import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile('referencias/TESTE.xlsx', 'r') as z:
    for name in z.namelist():
        if 'chart' in name.lower() or 'drawing' in name.lower():
            print(f"File: {name} (size: {z.getinfo(name).file_size})")
            content = z.read(name)[:500].decode('utf-8', errors='ignore')
            print(f"   Snippet: {content[:200]}")

