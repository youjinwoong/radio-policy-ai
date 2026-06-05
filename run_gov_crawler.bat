@echo off
cd /d C:\Users\SKTelecom\Desktop\frequence\전파정책전문가
echo [%date% %time%] === 크롤링 시작 === >> gov_crawler_log.txt
python gov_notice_crawler.py >> gov_crawler_log.txt 2>&1
python gov_playwright_crawler.py >> gov_crawler_log.txt 2>&1
echo [%date% %time%] === 완료 === >> gov_crawler_log.txt
