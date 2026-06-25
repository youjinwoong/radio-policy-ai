@echo off
set PYTHONUTF8=1
cd /d C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai
echo [%date% %time%] === 크롤링 시작 === >> gov_crawler_log.txt
python gov_notice_crawler.py >> gov_crawler_log.txt 2>&1
echo [%date% %time%] === 완료 === >> gov_crawler_log.txt
