-- 「평가 길잡이」 주말·휴일 안내 예약: 매일 15:00(한국 시각)에 osamcare.com 서버를 깨웁니다.
-- 서버가 "오늘이 쉬는 날 전 마지막 근무일인지"를 계산해서, 맞을 때만 안내를 만들고 푸시를 보냅니다(아닌 날은 아무 일도 안 함).
-- 같은 날 두 번 불러도 이미 보낸 선생님에게는 다시 보내지 않으므로, 15:10 에 한 번 더 부르는 것은 15:00 실패에 대비한 재시도입니다.
--
-- 사용법(처음 한 번): osamcare.com 프로젝트(OSAM, lvscywppavapsnxzflyq)의 SQL Editor 에서
--   1) 아래 <비밀값> 두 곳을 Vercel 환경변수 GUIDE_CRON_SECRET 과 같은 값으로 바꾸고
--   2) 실행합니다. 이 파일에는 실제 비밀값을 적어 저장소에 올리지 마세요.
-- 바꿀 때는 먼저 select cron.unschedule('guide-offday-alert'); 를 실행한 뒤 다시 등록합니다.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'guide-offday-alert',
  '0,10 6 * * *',   -- 06:00 UTC = 15:00 KST (그리고 15:10 재시도)
  $$
  select net.http_post(
    url := 'https://osamcare.com/api/guide/cron-alert',
    headers := jsonb_build_object('Authorization', 'Bearer <비밀값>', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- 확인용: 등록된 예약 목록
select jobid, jobname, schedule, active from cron.job where jobname = 'guide-offday-alert';

-- 실행 기록 보기(나중에 점검용):
--   select start_time, status, return_message from cron.job_run_details order by start_time desc limit 10;
--   select id, status_code, content from net._http_response order by created desc limit 5;
