-- 0005_reference_seed.sql
-- Reference data that is not demo data. Fixed-date public holidays only;
-- Tết, Giỗ Tổ Hùng Vương, the second Quốc khánh day and compensatory working
-- days are announced yearly and entered by an admin on /admin/settings (core Q12).

insert into public.sce_tcsk_holidays (holiday_date, name, kind)
select make_date(y, m, d), n, 'holiday'
  from generate_series(2025, 2030) as y,
       (values (1, 1, 'Tết Dương lịch'), (4, 30, 'Ngày Giải phóng miền Nam'),
               (5, 1, 'Ngày Quốc tế Lao động'), (9, 2, 'Quốc khánh')) as h(m, d, n)
on conflict (holiday_date) do nothing;

-- First admin (run by hand once, after that person has signed up):
--   select tcsk.bootstrap_first_admin('ten.nguoi@sce.hanoi.gov.vn');
