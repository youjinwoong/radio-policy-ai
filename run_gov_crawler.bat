@echo off
set PYTHONUTF8=1
cd /d C:\Users\SKTelecom\Desktop\frequence\radio-policy-ai
echo [%date% %time%] === crawl start === >> gov_crawler_log.txt
"C:\Users\SKTelecom\AppData\Local\Programs\Python\Python312\python.exe" gov_notice_crawler.py >> gov_crawler_log.txt 2>&1
echo [%date% %time%] === done === >> gov_crawler_log.txt
