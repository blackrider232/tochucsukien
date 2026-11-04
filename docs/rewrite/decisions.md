# Product decisions for the rewrite

The legacy specs in `docs/rewrite/spec/` raised many open product questions. These defaults apply to every module so the app behaves the same everywhere. A module worker follows them and does not re-decide them. If a default turns out wrong, change it here and in the affected module in one PR.

| # | Question | Decision |
|---|---|---|
| 1 | Public holidays in working-day math | Holidays are non-working days. They come from `sce_tcsk_holidays` (admin-entered each year). Weekends are non-working. One calendar helper in `@/core/dates`. |
| 2 | Guest invite quota (100% vs 130%) | Target guests = `targetGuests`. Invite quota = `ceil(targetGuests * quotaPercent / 100)`, with the percent taken from system settings (default 130). One selector in the guests feature, used by every module. |
| 3 | When is an event "Đã hoàn thành" | Derived, never stored: every step of the event is completed. |
| 4 | Do finished sub-tasks complete the step | No. A step is completed only by an explicit action. |
| 5 | Who may edit or delete events | Per the RBAC matrix in `docs/architecture/design.md`. |
| 6 | Offline editing | None. The app shows "Ngoại tuyến" and blocks writes. |
| 7 | Check-in of a guest who declined | Allowed only after a confirm dialog ("Đại biểu đã từ chối. Vẫn check-in?"). The confirmation is audited. |
| 8 | Welcome pack at check-in | Not automatic. It is a separate toggle, default not given. |
| 9 | VIP car pass fields | Keep the legacy fields. No plate or driver fields. |
| 10 | Seat for a walk-in guest | Staff picks the zone in the dialog. Default is the first zone with a free seat that is not a VIP zone. |
| 11 | "In VIP lounge" tracking | Not built. Remove it from the legend. |
| 12 | 2FA | Mandatory for admin and leader (per the design). |
| 13 | Sample and demo data | Never created automatically. Only an explicit admin action on a new event the admin names. |
| 14 | Word export | Stays Word-HTML saved as `.doc`, labelled honestly. No `.docx`. |
| 15 | Bidding packages ("/QUANLYDAUTHAU") | Manual entry, labelled "Nhập tay". No claim of an integration that does not exist. |
| 16 | Email sandbox/simulation mode | Removed. Real send only, plus a "Gửi thử cho tôi" test email to the signed-in user. |
| 17 | Who issues the official daily report | `reports.issue` is dept_leader and above. The signature block is the department head (commit 6463fbf). |
| 18 | Organization names | "Trung tâm Xúc tiến đầu tư và Hỗ trợ doanh nghiệp Hà Nội" under "Sở Tài chính Hà Nội" (commits aff2037, 6463fbf). One source: `orgIdentity(settings)`. |
| 19 | Seat model | One hall/zone/seat model in the venue feature, shared by seating and live check-in. No hard-coded 12/18/24 zones. |
| 20 | Check-in QR payload | One format: `SCE-CHK:<eventId>:<guestId>`. Legacy payloads are decoded when scanning only. |
