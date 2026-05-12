import React, { useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Coffee, Upload, Image as ImageIcon, FileSpreadsheet } from 'lucide-react';

export function ProductsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      alert(`已選擇檔案: ${file.name}，正在交由 AI 解析導入...`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">產品管理</h1>
          <p className="text-muted-foreground">管理菜單產品與客製化選項</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".xlsx,.xls,.csv,image/*" 
            onChange={handleFileUpload} 
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel 導入
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="w-4 h-4 mr-2" /> 圖片 AI 導入
          </Button>
          <Button>
            <Upload className="w-4 h-4 mr-2" /> 新增產品
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Coffee className="w-5 h-5"/> 產品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-400">
            <Coffee className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>目前沒有產品，請點擊上方按鈕導入或手動新增。</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
