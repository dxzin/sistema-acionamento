import openpyxl

wb = openpyxl.load_workbook('referencias/TESTE.xlsx', data_only=False)

def inspect_ubjp_helpers():
    print("=== INSPECTING COLUMNS S, T, U, V (or columns with no header / helper columns) IN UBJP ===")
    for s_name in ['01.06.26  - UBJP', '02.06.26  - UBJP', '15.06.26  - UBJP', '01.07.26 - UBJP', '01.08.26 - UBJP']:
        ws = wb[s_name]
        print(f"\n--- {s_name} ---")
        for r in range(1, 15):
            row_data = {}
            for c in range(15, ws.max_column+1):
                h = ws.cell(4, c).value
                v = ws.cell(r, c).value
                if v is not None:
                    col_letter = openpyxl.utils.get_column_letter(c)
                    row_data[f"{col_letter}({h})"] = v
            if row_data:
                print(f"Row {r:2d}: {row_data}")

inspect_ubjp_helpers()
