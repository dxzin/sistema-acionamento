import openpyxl, json

wb = openpyxl.load_workbook('referencias/TESTE.xlsx', data_only=False)

def inspect_abonar_refeicao():
    print("=== INSPECTING ABONAR & REFEICAO COLUMNS IN UBJP ===")
    for s_name in ['01.06.26  - UBJP', '15.07.26 - UBJP', '01.08.26 - UBJP', '15.08.26 - UBJP']:
        ws = wb[s_name]
        print(f"\n--- SHEET: {s_name} ---")
        headers = {}
        for c in range(1, ws.max_column+1):
            h = ws.cell(4, c).value
            if h:
                headers[c] = (openpyxl.utils.get_column_letter(c), h)
        
        # Check ABONAR and REFEICAO columns
        for c, (col_letter, h) in headers.items():
            if any(k in str(h).upper() for k in ['ABONAR', 'REFEI', 'COLUNA', 'HORA', 'TEMPO']):
                vals = [ws.cell(r, c).value for r in range(5, 10)]
                print(f"Col {col_letter} ({c:2d}) [{h}]: sample rows 5-9 -> {vals[:3]}")

inspect_abonar_refeicao()
