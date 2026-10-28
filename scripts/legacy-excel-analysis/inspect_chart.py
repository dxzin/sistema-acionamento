import openpyxl

wb = openpyxl.load_workbook('referencias/TESTE.xlsx', data_only=False)

# Inspect Gráfico3 if present
for cs in wb._charts:
    print("Chartsheet title:", cs.title)

