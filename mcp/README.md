# Hướng Dẫn Tích Hợp Model Context Protocol (MCP) - SCE Event Management

Thư mục này chứa cấu hình và tài liệu chuẩn kết nối giao thức MCP (Model Context Protocol) giữa các trợ lý AI (Antigravity, Cursor, Claude Desktop, Windsurf, v.v.) và hệ sinh thái phần mềm Quản trị Tổ chức Sự kiện (SCE).

## 1. Cấu hình MCP Servers (`mcp_servers.json`)

Hệ thống hỗ trợ 2 MCP Server cốt lõi:
1. **`supabase-tcsk` (PostgreSQL / Supabase MCP Server):**
   - Cho phép AI Agent tra cứu cấu trúc bảng, kiểm tra logs kiểm toán (`sce_tcsk_audit_logs`), kiểm tra hồ sơ người dùng (`sce_tcsk_profiles`), và trạng thái dữ liệu sự kiện (`sce_tcsk_app_data`).
   - Project Supabase: `https://xqmeeticiwclsvckpqrd.supabase.co`
   - Bảng RLS bảo mật:
     - `public.sce_tcsk_profiles`
     - `public.sce_tcsk_app_data`
     - `public.sce_tcsk_backups`
     - `public.sce_tcsk_audit_logs`
2. **`tcsk-filesystem` (Local Filesystem MCP Server):**
   - Cung cấp ngữ cảnh cấu trúc thư mục phân tách:
     - `doc/`: Tài liệu nghiệp vụ & 23 biểu mẫu hành chính chuẩn Nghị định 30/2020/NĐ-CP.
     - `code/`: Mã nguồn ứng dụng web SPA/PWA (`code/index.html`, `code/sw.js`, `code/manifest.json`), database schema và test suite.
     - `icon/`: Hệ thống nhận diện thương hiệu, logo SCE và app icons.

## 2. Quy tắc cho AI Agents khi sử dụng MCP
- **Bảo mật RLS:** Mọi truy vấn database qua MCP không được bypass các chính sách RLS của Supabase.
- **Audit Logging:** Khi thực hiện bất kỳ thao tác nhạy cảm nào trên dữ liệu thông qua MCP tools, phải luôn đối chiếu với bảng `sce_tcsk_audit_logs`.
- **Knowledge Priming:** Trước khi thao tác sửa đổi mã nguồn hoặc sinh dữ liệu mới, AI Agent bắt buộc phải đọc file kiến thức chung tại gốc: `PROJECT_KNOWLEDGE.md`.
