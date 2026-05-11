"""
ULTRA_POS 數據導入腳本
從 Excel 文件導入產品和倉庫數據到 Supabase

使用方法:
1. 安裝依賴: pip install pandas openpyxl supabase python-dotenv
2. 設置環境變量或直接填入 SUPABASE_URL 和 SUPABASE_KEY
3. 運行腳本: python import_data.py
"""

import os
import json
from pathlib import Path

# 嘗試導入必要模組
try:
    import pandas as pd
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"缺少依賴: {e}")
    print("請運行: pip install pandas openpyxl supabase python-dotenv")
    exit(1)

# ========================================
# 配置
# ========================================

# 從環境變量讀取（推薦）
load_dotenv()

SUPABASE_URL = os.getenv('SUPABASE_URL', '')
SUPABASE_KEY = os.getenv('SUPABASE_KEY', '')

# 或者直接填入（測試用）
# SUPABASE_URL = 'https://your-project.supabase.co'
# SUPABASE_KEY = 'your-anon-key'

# Excel 文件路徑
PRODUCTS_FILE = 'C:/Users/USER/Desktop/MyApp/Products.xlsx'
INVENTORY_FILE = 'C:/Users/USER/Desktop/MyApp/家傳x飲得 貨倉表.xlsx'

# 餐廳 ID（預設）
RESTAURANT_ID = '00000000-0000-0000-0000-000000000001'

# ========================================
# 顏色輸出
# ========================================

class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'

def print_success(msg):
    print(f"{Colors.OKGREEN}✓ {msg}{Colors.ENDC}")

def print_error(msg):
    print(f"{Colors.FAIL}✗ {msg}{Colors.ENDC}")

def print_info(msg):
    print(f"{Colors.OKBLUE}ℹ {msg}{Colors.ENDC}")

def print_warning(msg):
    print(f"{Colors.WARNING}⚠ {msg}{Colors.ENDC}")

# ========================================
# 讀取 Excel 數據
# ========================================

def read_products():
    """讀取產品數據"""
    print_info(f"讀取產品文件: {PRODUCTS_FILE}")
    
    try:
        # 讀取所有工作表
        sheets = pd.read_excel(PRODUCTS_FILE, sheet_name=None)
        
        products = []
        
        for sheet_name, df in sheets.items():
            print_info(f"  處理工作表: {sheet_name}")
            
            # 嘗試識別欄位
            for _, row in df.iterrows():
                # 嘗試不同的欄位名稱
                name = None
                for col in df.columns:
                    if '名' in str(col) or '名稱' in str(col):
                        name = row[col]
                        break
                
                price = None
                for col in df.columns:
                    if '價' in str(col) or 'price' in str(col).lower():
                        price = row[col]
                        break
                
                if name and pd.notna(name):
                    product = {
                        'name': str(name).strip(),
                        'category': sheet_name,
                        'price': float(price) if price and pd.notna(price) else 0
                    }
                    products.append(product)
        
        print_success(f"共讀取 {len(products)} 項產品")
        return products
        
    except Exception as e:
        print_error(f"讀取產品文件失敗: {e}")
        return []

def read_inventory():
    """讀取倉庫存貨數據"""
    print_info(f"讀取倉庫文件: {INVENTORY_FILE}")
    
    try:
        sheets = pd.read_excel(INVENTORY_FILE, sheet_name=None)
        
        inventory = []
        
        for sheet_name, df in sheets.items():
            print_info(f"  處理工作表: {sheet_name}")
            
            for _, row in df.iterrows():
                # 嘗試識別欄位
                name = None
                for col in df.columns:
                    col_str = str(col).lower()
                    if '名' in str(col) or 'item' in col_str or 'name' in col_str:
                        name = row[col]
                        break
                
                if name and pd.notna(name):
                    inventory.append({
                        'name': str(name).strip(),
                        'category': sheet_name,
                        'current_stock': 0,  # 初始為0
                        'min_stock_level': 10,  # 預設最小庫存
                    })
        
        print_success(f"共讀取 {len(inventory)} 項倉庫存貨")
        return inventory
        
    except Exception as e:
        print_error(f"讀取倉庫文件失敗: {e}")
        return []

# ========================================
# Supabase 導入
# ========================================

def get_categories(supabase: Client):
    """獲取現有分類"""
    response = supabase.table('categories').select('id, name').execute()
    return {cat['name']: cat['id'] for cat in response.data}

def import_products(supabase: Client, products: list):
    """導入產品數據"""
    print_info("開始導入產品...")
    
    categories = get_categories(supabase)
    print_info(f"現有分類: {list(categories.keys())}")
    
    # 創建不存在的分類
    existing_cats = set(categories.keys())
    for product in products:
        cat_name = product['category']
        if cat_name not in existing_cats:
            print_warning(f"  新增分類: {cat_name}")
            response = supabase.table('categories').insert({
                'restaurant_id': RESTAURANT_ID,
                'name': cat_name,
                'sort_order': 99
            }).execute()
            if response.data:
                categories[cat_name] = response.data[0]['id']
    
    imported = 0
    skipped = 0
    
    for product in products:
        cat_id = categories.get(product['category'])
        
        # 檢查產品是否已存在
        existing = supabase.table('products').select('id').eq('name', product['name']).execute()
        
        if existing.data:
            skipped += 1
            continue
        
        data = {
            'restaurant_id': RESTAURANT_ID,
            'category_id': cat_id,
            'name': product['name'],
            'price': product['price'],
            'status': 'available'
        }
        
        try:
            supabase.table('products').insert(data).execute()
            imported += 1
        except Exception as e:
            print_error(f"  導入產品失敗: {product['name']} - {e}")
    
    print_success(f"產品導入完成: 新增 {imported}, 跳過 {skipped}")
    return imported, skipped

def import_inventory(supabase: Client, inventory: list):
    """導入倉庫存貨數據"""
    print_info("開始導入倉庫存貨...")
    
    imported = 0
    skipped = 0
    
    for item in inventory:
        # 檢查是否已存在
        existing = supabase.table('inventory').select('id').eq('name', item['name']).execute()
        
        if existing.data:
            skipped += 1
            continue
        
        data = {
            'restaurant_id': RESTAURANT_ID,
            'category': item['category'],
            'name': item['name'],
            'unit': '項',  # 預設單位
            'current_stock': item.get('current_stock', 0),
            'min_stock_level': item.get('min_stock_level', 10)
        }
        
        try:
            supabase.table('inventory').insert(data).execute()
            imported += 1
        except Exception as e:
            print_error(f"  導入存貨失敗: {item['name']} - {e}")
    
    print_success(f"倉庫存貨導入完成: 新增 {imported}, 跳過 {skipped}")
    return imported, skipped

# ========================================
# 主程序
# ========================================

def main():
    print("\n" + "="*50)
    print("ULTRA_POS 數據導入工具")
    print("="*50 + "\n")
    
    # 檢查配置
    if not SUPABASE_URL or not SUPABASE_KEY:
        print_error("請設置 SUPABASE_URL 和 SUPABASE_KEY 環境變量")
        print("\n或者編輯此腳本直接填入:")
        print("  SUPABASE_URL = 'https://xxx.supabase.co'")
        print("  SUPABASE_KEY = 'your-anon-key'")
        exit(1)
    
    # 連接 Supabase
    print_info("連接到 Supabase...")
    try:
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print_success("連接成功!")
    except Exception as e:
        print_error(f"連接失敗: {e}")
        exit(1)
    
    # 讀取數據
    products = read_products()
    inventory = read_inventory()
    
    if not products and not inventory:
        print_error("沒有讀取到任何數據，請檢查文件路徑")
        exit(1)
    
    # 導入數據
    print("\n" + "-"*50)
    
    if products:
        import_products(supabase, products)
    else:
        print_warning("跳過產品導入（無數據）")
    
    if inventory:
        import_inventory(supabase, inventory)
    else:
        print_warning("跳過倉庫導入（無數據）")
    
    # 顯示統計
    print("\n" + "="*50)
    print("導入完成!")
    print("="*50)
    
    print("\n當前數據統計:")
    
    # 餐廳
    response = supabase.table('restaurants').select('name').execute()
    if response.data:
        print(f"  餐廳: {response.data[0]['name']}")
    
    # 分類
    response = supabase.table('categories').select('id').execute()
    print(f"  分類: {len(response.data)} 個")
    
    # 產品
    response = supabase.table('products').select('id').execute()
    print(f"  產品: {len(response.data)} 項")
    
    # 倉庫存貨
    response = supabase.table('inventory').select('id').execute()
    print(f"  倉庫存貨: {len(response.data)} 項")
    
    # 員工
    response = supabase.table('employees').select('id').execute()
    print(f"  員工: {len(response.data)} 人")
    
    print("\n" + "="*50)
    print("現在可以啟動 ULTRA_POS 了!")
    print("  cd C:\\Users\\USER\\Desktop\\MyApp\\ULTRA_POS")
    print("  npm run dev")
    print("="*50 + "\n")

if __name__ == '__main__':
    main()
