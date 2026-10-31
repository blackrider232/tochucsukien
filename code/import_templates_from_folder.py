# -*- coding: utf-8 -*-
"""
Script nhập lại các biểu mẫu từ thư mục 'Biểu mẫu' vào hệ thống index.html và Supabase.
Sử dụng khi người dùng hoàn thành việc chỉnh sửa các file .doc trong thư mục 'Biểu mẫu'.
"""
import os
import re
import json
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

script_dir = os.path.dirname(os.path.abspath(__file__))
folder = os.path.join(script_dir, "..", "doc", "Biểu mẫu")
if not os.path.exists(folder):
    folder = os.path.join(script_dir, "Biểu mẫu")

manifest_path = os.path.join(folder, "manifest.json")

if not os.path.exists(manifest_path):
    print(f"Lỗi: Không tìm thấy {manifest_path}")
    exit(1)

with open(manifest_path, "r", encoding="utf-8") as mf:
    manifest = json.load(mf)

index_path = os.path.join(script_dir, "index.html")
with open(index_path, "r", encoding="utf-8") as f:
    html = f.read()

m = re.search(r'const STANDARD_TEMPLATES = (\[.*?\]);', html)
if not m:
    print("Lỗi: Không tìm thấy STANDARD_TEMPLATES trong index.html")
    exit(1)

current_templates = json.loads(m.group(1))
template_map = {t["id"]: t for t in current_templates}

updated_count = 0

for item in manifest:
    t_id = item["id"]
    filename = item["filename"]
    filepath = os.path.join(folder, filename)

    if not os.path.exists(filepath):
        print(f"Cảnh báo: Không tìm thấy file {filepath}")
        continue

    with open(filepath, "r", encoding="utf-8") as doc_f:
        doc_content = doc_f.read()

    # Extract content inside <div class="WordSection1">...</div>
    match_body = re.search(r'<div class="WordSection1">(.*?)</div>\s*</body>', doc_content, re.DOTALL | re.IGNORECASE)
    if match_body:
        inner_content = match_body.group(1).strip()
    else:
        # Fallback to body content
        match_body2 = re.search(r'<body[^>]*>(.*?)</body>', doc_content, re.DOTALL | re.IGNORECASE)
        if match_body2:
            inner_content = match_body2.group(1).strip()
        else:
            inner_content = doc_content.strip()

    if t_id in template_map:
        template_map[t_id]["content"] = inner_content
        updated_count += 1
    else:
        # New template
        template_map[t_id] = {
            "id": t_id,
            "code": item.get("code", "BM-SCE"),
            "title": item.get("title", filename.replace(".doc", "")),
            "group": item.get("group", "cap_trungtam"),
            "groupName": item.get("groupName", "3. Cấp Trung tâm (SCE)"),
            "type": item.get("type", "doc"),
            "description": item.get("description", ""),
            "content": inner_content
        }
        updated_count += 1

updated_list = list(template_map.values())
new_json_str = json.dumps(updated_list, ensure_ascii=False)

new_html = html[:m.start(1)] + new_json_str + html[m.end(1):]

with open(index_path, "w", encoding="utf-8") as f:
    f.write(new_html)

print(f"Đã cập nhật thành công {updated_count} biểu mẫu từ thư mục '{folder}' vào index.html.")
